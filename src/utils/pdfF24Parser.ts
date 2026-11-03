/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ParsedF24Entry {
  taxCode: string; // Codice tributo (es. 1792, 1790, 1791, 6099, 4001) o causale INPS (PXX, P10, AP, etc.)
  debtAmount: number; // Importo a debito versato
  creditAmount: number; // Importo a credito compensato (COMPENSAZIONI)
  amount: number; // Netto del tributo (debtAmount > 0 ? debtAmount : -creditAmount, or debtAmount - creditAmount)
  year?: string;
  section?: 'erario' | 'inps' | 'regioni' | 'imu' | 'altri';
  periodFrom?: string;
  periodTo?: string;
  rateCode?: string;
  description?: string;
  deadlineType?: 'saldo' | 'acconto1' | 'acconto2' | 'ordinario';
  rawLine?: string;
}

export interface ParsedF24Document {
  fileName: string;
  taxpayerName?: string;
  taxpayerFiscalCode?: string;
  paymentDate?: string;
  protocolloTelematico?: string;
  entries: ParsedF24Entry[];
  totalDebt: number; // TOTALE A (Totale importi a debito)
  totalCredit: number; // TOTALE B (Totale compensazioni / importi a credito)
  netDue: number; // SALDO FINALE (A - B) -> Netto effettivo da pagare / addebitato
  status: 'saldo_zero' | 'a_debito' | 'a_credito';
  rawSummaryText?: string;
}

const KNOWN_ERARIO_CODES = [
  '1790', '1791', '1792', // Imposta sostitutiva forfettario (acconto 1, acconto 2, saldo)
  '4001', '4002', '4003', '4004', '4005', // IRPEF saldo e acconti
  '1668', // Interessi rateazione
  '6099', '6001', '6002', '6003', '6004', '6005', '6006', '6007', '6008', '6009', '6010', '6011', '6012', // IVA saldo e acconti / crediti
  '3800', '3801', '3802', '3805', // Addizionali Regionali IRPEF
  '3844', '3847', '3848', // Addizionali Comunali IRPEF
  '8911', // Sanzioni ravvedimento imposte dirette
  '1989'  // Interessi ravvedimento imposte dirette
];

const KNOWN_INPS_CODES = [
  'PXX', 'P10', // Gestione Separata Professionisti (senza / con altra cassa)
  'CXX', 'C10', // Gestione Separata Collaboratori
  'AF', 'CF', 'AP', 'CP', 'API', 'CPI', 'CPM', 'APM' // Artigiani e Commercianti IVS
];

/**
 * Pulisce una stringa di importo italiano o decimale convertendola in float.
 * Esempi: "46,00", "68,00", "1.250,50", "46.00", "0,00"
 */
export function parseItalianNumber(val: string): number {
  if (!val) return 0;
  let clean = val.trim();
  clean = clean.replace(/€/g, '').replace(/\s+/g, '');
  if (clean.includes(',') && clean.includes('.')) {
    // 1.250,50 -> 1250.50
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    // 46,00 -> 46.00
    clean = clean.replace(',', '.');
  }
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

interface TextItemPosition {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Estrae analiticamente l'intero documento F24 con:
 * - Dati anagrafici (CF, nominativo, data pagamento)
 * - Dettaglio di ciascun tributo con importo a debito E importo a credito (compensazione)
 * - Totale complessivo a debito (A), Totale compensazioni (B) e Saldo netto da pagare (A - B)
 */
export async function extractDetailedF24Document(file: File): Promise<ParsedF24Document> {
  const defaultYear = new Date().getFullYear().toString();
  const docResult: ParsedF24Document = {
    fileName: file.name,
    entries: [],
    totalDebt: 0,
    totalCredit: 0,
    netDue: 0,
    status: 'a_debito'
  };

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    const allLinesWithItems: { line: string; items: TextItemPosition[] }[] = [];
    const allTextList: string[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const rawItems = textContent.items as any[];

      const positionedItems: TextItemPosition[] = rawItems
        .filter(it => it.str && it.str.trim())
        .map(it => ({
          str: it.str.trim(),
          x: it.transform[4],
          y: it.transform[5],
          width: it.width || 0,
          height: it.height || 0
        }));

      // Ordina per coordinata Y decrescente (dall'alto in basso)
      positionedItems.sort((a, b) => b.y - a.y);

      // Raggruppa in righe orizzontali (tolleranza 10pt)
      const verticalTolerance = 10;
      let currentLineItems: TextItemPosition[] = [];
      let currentY: number | null = null;

      for (const item of positionedItems) {
        if (currentY === null) {
          currentY = item.y;
          currentLineItems.push(item);
        } else if (Math.abs(currentY - item.y) <= verticalTolerance) {
          currentLineItems.push(item);
        } else {
          currentLineItems.sort((a, b) => a.x - b.x);
          const lineStr = currentLineItems.map(it => it.str).join(' ');
          allLinesWithItems.push({ line: lineStr, items: currentLineItems });
          allTextList.push(lineStr);
          currentY = item.y;
          currentLineItems = [item];
        }
      }

      if (currentLineItems.length > 0) {
        currentLineItems.sort((a, b) => a.x - b.x);
        const lineStr = currentLineItems.map(it => it.str).join(' ');
        allLinesWithItems.push({ line: lineStr, items: currentLineItems });
        allTextList.push(lineStr);
      }
    }

    const fullText = allTextList.join('\n');

    // 1. Estrazione Metadati Contribuente (Codice Fiscale, Nome, Data)
    const cfMatch = fullText.match(/\b([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]|[0-9]{11})\b/i);
    if (cfMatch) {
      docResult.taxpayerFiscalCode = cfMatch[1].toUpperCase();
    }

    // Data di versamento / pagamento o quietanza
    const dateMatch = fullText.match(/\b([0-3]?[0-9][\/\-.][0-1][0-9][\/\-.](?:202[0-9]|20[0-9]{2}))\b/);
    if (dateMatch) {
      docResult.paymentDate = dateMatch[1].replace(/[-.]/g, '/');
    }

    // Protocollo telematico se presente
    const protMatch = fullText.match(/(?:protocollo|ricevuta|operazione|cro|quietanza)[\s:]*([A-Z0-9\-_]{10,30})/i);
    if (protMatch) {
      docResult.protocolloTelematico = protMatch[1];
    }

    // 2. Analisi Rigo per Rigo dei Tributi con Debito e Credito/Compensazione
    const seenEntryKeys = new Set<string>();

    for (const { line, items } of allLinesWithItems) {
      const cleanLine = line.replace(/\s+/g, ' ').trim();
      if (!cleanLine) continue;

      // Estrai tutti i numeri monetari presenti sulla riga
      // es. 46,00 | 68,00 | 1.250,00 | 0,00
      const moneyMatches = Array.from(cleanLine.matchAll(/(?:\b|€\s*)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})\b/g));
      const yearMatch = cleanLine.match(/\b(202[0-9])\b/) || cleanLine.match(/(\d{2})\/(\d{4})/);
      const rowYear = yearMatch ? (yearMatch[2] || yearMatch[1]) : defaultYear;

      // A) SEZIONE INPS: Causali PXX, P10, CXX, C10, AF, CF, ecc.
      const inpsMatch = cleanLine.match(/\b(PXX|P10|CXX|C10|AF|CF|AP|CP|API|CPI)\b/i);
      if (inpsMatch) {
        const taxCode = inpsMatch[1].toUpperCase();
        
        // Determina debiti e crediti nella riga
        // In una riga F24 standard ci sono 2 colonne d'importo: [DEBITO] [CREDITO COMPENSATO]
        let debtVal = 0;
        let creditVal = 0;

        const candidateAmounts: number[] = [];
        for (const m of moneyMatches) {
          const val = parseItalianNumber(m[1]);
          // Filtra codici di sede come 8200 o numeri di matricola identici
          if (val > 0 || m[1].includes('0,00')) {
            if (val !== 8200) {
              candidateAmounts.push(val);
            }
          }
        }

        if (candidateAmounts.length >= 2) {
          // Tipico caso ministeriale: prima colonna è debito, seconda è credito/compensazione
          debtVal = candidateAmounts[0];
          creditVal = candidateAmounts[1];
        } else if (candidateAmounts.length === 1) {
          // Se compare solo un importo, verifica se è specificato "credito" o "compensat"
          if (cleanLine.toLowerCase().includes('credito') || cleanLine.toLowerCase().includes('compens')) {
            creditVal = candidateAmounts[0];
          } else {
            debtVal = candidateAmounts[0];
          }
        }

        if (debtVal > 0 || creditVal > 0) {
          const entryKey = `INPS-${taxCode}-${rowYear}-${debtVal.toFixed(2)}-${creditVal.toFixed(2)}`;
          if (!seenEntryKeys.has(entryKey)) {
            seenEntryKeys.add(entryKey);

            let deadlineType: 'saldo' | 'acconto1' | 'acconto2' | 'ordinario' = 'ordinario';
            let description = `INPS ${taxCode} Gestione Separata`;

            if (taxCode === 'PXX' || taxCode === 'P10') {
              if (debtVal <= 50 || cleanLine.includes('06') || cleanLine.includes('GIU') || cleanLine.toLowerCase().includes('primo')) {
                deadlineType = 'acconto1';
                description = `INPS ${taxCode} - 1° Acconto (40% Scadenza Giugno)`;
              } else if (debtVal > 50 || cleanLine.includes('11') || cleanLine.includes('NOV') || cleanLine.toLowerCase().includes('secondo')) {
                deadlineType = 'acconto2';
                description = `INPS ${taxCode} - 2° Acconto (60% Scadenza Novembre)`;
              } else {
                deadlineType = 'saldo';
                description = `INPS ${taxCode} - Saldo (${rowYear})`;
              }
            }

            docResult.entries.push({
              taxCode,
              debtAmount: debtVal,
              creditAmount: creditVal,
              amount: debtVal > 0 ? debtVal : -creditVal,
              year: rowYear,
              section: 'inps',
              deadlineType,
              description,
              rawLine: cleanLine
            });
          }
        }
      }

      // B) SEZIONE ERARIO / REGIONI: 1792, 1790, 1791, 4001, 6099, 8911, 1989, 3801, ecc.
      const erarioMatch = cleanLine.match(/\b(1790|1791|1792|4001|4002|4003|1668|6099|6001|6002|6003|6004|6005|6006|6007|6008|6009|6010|6011|6012|3800|3801|3802|3847|3848|8911|1989)\b/);
      if (erarioMatch) {
        const taxCode = erarioMatch[1];

        let debtVal = 0;
        let creditVal = 0;

        const candidateAmounts: number[] = [];
        for (const m of moneyMatches) {
          const val = parseItalianNumber(m[1]);
          if (val !== parseInt(taxCode, 10)) {
            candidateAmounts.push(val);
          }
        }

        if (candidateAmounts.length >= 2) {
          debtVal = candidateAmounts[0];
          creditVal = candidateAmounts[1];
        } else if (candidateAmounts.length === 1) {
          if (cleanLine.toLowerCase().includes('credito') || cleanLine.toLowerCase().includes('compens') || taxCode === '6099') {
            // 6099 o esplicito credito compensato
            if (cleanLine.toLowerCase().includes('debito')) {
              debtVal = candidateAmounts[0];
            } else {
              creditVal = candidateAmounts[0];
            }
          } else {
            debtVal = candidateAmounts[0];
          }
        }

        if (debtVal > 0 || creditVal > 0) {
          const entryKey = `ERARIO-${taxCode}-${rowYear}-${debtVal.toFixed(2)}-${creditVal.toFixed(2)}`;
          if (!seenEntryKeys.has(entryKey)) {
            seenEntryKeys.add(entryKey);

            let deadlineType: 'saldo' | 'acconto1' | 'acconto2' | 'ordinario' = 'ordinario';
            let description = `Erario Cod. ${taxCode}`;

            if (taxCode === '1792') {
              deadlineType = 'saldo';
              description = `Imposta Sostitutiva - Saldo (${rowYear})`;
            } else if (taxCode === '1790') {
              deadlineType = 'acconto1';
              description = `Imposta Sostitutiva - 1° Acconto (${rowYear})`;
            } else if (taxCode === '1791') {
              deadlineType = 'acconto2';
              description = `Imposta Sostitutiva - 2° Acconto / Unica Soluz. (${rowYear})`;
            } else if (taxCode === '8911') {
              description = `Sanzioni Ravvedimento Operoso (Cod. 8911)`;
            } else if (taxCode === '1989') {
              description = `Interessi Ravvedimento Operoso (Cod. 1989)`;
            } else if (taxCode.startsWith('60')) {
              description = `IVA Credito / Compensazione (Cod. ${taxCode})`;
            } else if (taxCode === '4001') {
              description = `IRPEF Saldo (Cod. 4001)`;
            }

            docResult.entries.push({
              taxCode,
              debtAmount: debtVal,
              creditAmount: creditVal,
              amount: debtVal > 0 ? debtVal : -creditVal,
              year: rowYear,
              section: taxCode.startsWith('38') ? 'regioni' : 'erario',
              deadlineType,
              description,
              rawLine: cleanLine
            });
          }
        }
      }
    }

    // 3. Fallback globale se l'analisi strutturata ha trovato 0 tributi (es. scansione di testo non tabellare)
    if (docResult.entries.length === 0) {
      // Cerca Erario nel fullText
      const erarioGlobal = Array.from(fullText.matchAll(/\b(1790|1791|1792|4001|6099|8911|1989)\b[^\d]*(\d{4})?[^\d]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi));
      for (const m of erarioGlobal) {
        const taxCode = m[1];
        const rowYear = m[2] || defaultYear;
        const val = parseItalianNumber(m[3]);
        if (val > 0 && val !== parseInt(taxCode, 10)) {
          const entryKey = `ERARIO-FALLBACK-${taxCode}-${val.toFixed(2)}`;
          if (!seenEntryKeys.has(entryKey)) {
            seenEntryKeys.add(entryKey);
            docResult.entries.push({
              taxCode,
              debtAmount: val,
              creditAmount: 0,
              amount: val,
              year: rowYear,
              section: 'erario',
              description: `Tributo Erario ${taxCode}`
            });
          }
        }
      }

      // Cerca INPS nel fullText
      const inpsGlobal = Array.from(fullText.matchAll(/\b(PXX|P10|AF|CF)\b[^\d]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi));
      for (const m of inpsGlobal) {
        const taxCode = m[1].toUpperCase();
        const val = parseItalianNumber(m[2]);
        if (val > 0 && val !== 8200) {
          const entryKey = `INPS-FALLBACK-${taxCode}-${val.toFixed(2)}`;
          if (!seenEntryKeys.has(entryKey)) {
            seenEntryKeys.add(entryKey);
            docResult.entries.push({
              taxCode,
              debtAmount: val,
              creditAmount: 0,
              amount: val,
              year: defaultYear,
              section: 'inps',
              deadlineType: val <= 50 ? 'acconto1' : 'acconto2',
              description: `INPS ${taxCode} (${val <= 50 ? '40% Giugno' : '60% Novembre'})`
            });
          }
        }
      }
    }

    // 4. Calcolo e quadratura dei TOTALI (Debito, Compensazioni, Saldo Netto da Pagare)
    let sumDebt = docResult.entries.reduce((sum, e) => sum + (e.debtAmount || 0), 0);
    let sumCredit = docResult.entries.reduce((sum, e) => sum + (e.creditAmount || 0), 0);

    // Cerca eventuali totali esplicitati nel testo dell'F24 (es. "SALDO (A - B)", "SALDO FINALE", "TOTALE ADDEBITATO")
    const saldoMatch = fullText.match(/(?:saldo\s*(?:\(a\s*-\s*b\)|finale|complessivo|da\s*versare)|totale\s*(?:addebitato|versamento|f24|pagamento)|netto\s*da\s*pagare)[\s:€]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i);
    let explicitNetDue: number | null = null;
    if (saldoMatch) {
      explicitNetDue = parseItalianNumber(saldoMatch[1]);
    }

    // Cerca TOTALE A e TOTALE B espliciti
    const totAMatch = fullText.match(/totale\s*a[\s:€]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i);
    if (totAMatch) {
      const explicitDebt = parseItalianNumber(totAMatch[1]);
      if (explicitDebt > 0) sumDebt = explicitDebt;
    }

    const totBMatch = fullText.match(/totale\s*b[\s:€]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i);
    if (totBMatch) {
      const explicitCredit = parseItalianNumber(totBMatch[1]);
      if (explicitCredit >= 0) sumCredit = explicitCredit;
    }

    docResult.totalDebt = sumDebt;
    docResult.totalCredit = sumCredit;

    if (explicitNetDue !== null) {
      docResult.netDue = explicitNetDue;
    } else {
      docResult.netDue = Math.max(0, sumDebt - sumCredit);
    }

    if (docResult.netDue === 0 && (docResult.totalDebt > 0 || docResult.totalCredit > 0)) {
      docResult.status = 'saldo_zero';
    } else if (docResult.netDue > 0) {
      docResult.status = 'a_debito';
    } else {
      docResult.status = 'a_credito';
    }

    return docResult;
  } catch (err) {
    console.warn("Global catch in F24 PDF extraction:", err);
    return docResult;
  }
}

/**
 * Funzione di compatibilità retroattiva: restituisce l'array di tributi/quietanze
 */
export async function extractF24DataFromPdf(file: File): Promise<ParsedF24Entry[]> {
  const doc = await extractDetailedF24Document(file);
  return doc.entries;
}
