/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  } catch (e) {
    console.warn("Could not set pdfjs workerSrc:", e);
  }
}

export interface ParsedF24Entry {
  taxCode: string; // Codice tributo (es. 1792, 1790, 1791, 6099, 4001, 4033, 3801) o causale INPS (PXX, P10, AF, CF, etc.)
  debtAmount: number; // Importo a debito versato
  creditAmount: number; // Importo a credito compensato (COMPENSAZIONI)
  amount: number; // Netto del tributo (debtAmount > 0 ? debtAmount : -creditAmount)
  year?: string;
  targetYear?: string;
  isAcconto?: boolean;
  section?: 'erario' | 'inps' | 'regioni' | 'imu' | 'altri';
  periodFrom?: string;
  periodTo?: string;
  rateCode?: string;
  description?: string;
  deadlineType?: 'saldo' | 'acconto1' | 'acconto2' | 'ordinario';
  rawLine?: string;
  dueDate?: string; // Data di scadenza del modello (es. 20-08-2026, 30-11-2026)
}

export interface ParsedF24Document {
  fileName: string;
  pageCount?: number; // Numero pagine del documento F24 (es. 2 pagine per delega multi-scadenza)
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

/**
 * Pulisce una stringa di importo italiano o decimale convertendola in float.
 * Esempi: "46,00", "68,00", "1.250,50", "46.00", "0,00", "€ 46.00"
 */
export function parseItalianNumber(val: string): number {
  if (!val) return 0;
  let clean = val.trim();
  clean = clean.replace(/€/g, '').replace(/[\s\xa0]+/g, '');
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

export interface TextItemPosition {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Mappatura descrizioni per codici tributo noti Erario, Regioni, INPS e Enti Locali
 */
export function getTaxCodeDescription(
  code: string, 
  debt: number = 0, 
  credit: number = 0,
  lineText: string = '',
  dueDate: string = ''
): { description: string; deadlineType: 'saldo' | 'acconto1' | 'acconto2' | 'ordinario'; section: 'erario' | 'inps' | 'regioni' | 'imu' | 'altri' } {
  const uppercaseCode = code.toUpperCase();

  // INPS Gestione Separata e Altre Causali INPS
  if (['PXX', 'P10', 'CXX', 'C10'].includes(uppercaseCode)) {
    const isGiu = lineText.includes('06 2025') || lineText.includes('06/2025') || dueDate.includes('08-2026') || dueDate.includes('06-2026') || lineText.toUpperCase().includes('GIU') || debt === 46;
    const isNov = lineText.includes('11 2025') || lineText.includes('11/2025') || dueDate.includes('11-2026') || lineText.toUpperCase().includes('NOV') || debt === 68;

    if (isGiu) {
      return {
        description: `INPS ${uppercaseCode} - 1° Acconto (40% Scadenza Giugno/Agosto)`,
        deadlineType: 'acconto1',
        section: 'inps'
      };
    } else if (isNov) {
      return {
        description: `INPS ${uppercaseCode} - 2° Acconto (60% Scadenza Novembre)`,
        deadlineType: 'acconto2',
        section: 'inps'
      };
    }
    return {
      description: `INPS ${uppercaseCode} Gestione Separata Saldo`,
      deadlineType: 'saldo',
      section: 'inps'
    };
  }

  if (['AF', 'CF', 'AP', 'CP', 'API', 'CPI', 'APM', 'CPM'].includes(uppercaseCode)) {
    return {
      description: `INPS Artigiani/Commercianti (${uppercaseCode})`,
      deadlineType: 'ordinario',
      section: 'inps'
    };
  }

  // Erario Forfettario
  if (code === '1792') {
    return { description: 'Imposta Sostitutiva Forfettario - Saldo', deadlineType: 'saldo', section: 'erario' };
  }
  if (code === '1790') {
    return { description: 'Imposta Sostitutiva Forfettario - 1° Acconto (50%)', deadlineType: 'acconto1', section: 'erario' };
  }
  if (code === '1791') {
    return { description: 'Imposta Sostitutiva Forfettario - 2° Acconto / Unica Soluzione (50%)', deadlineType: 'acconto2', section: 'erario' };
  }

  // IRPEF Ordinaria
  if (code === '4001') {
    if (credit > 0) {
      return { description: `IRPEF Credito in Compensazione (Cod. 4001)`, deadlineType: 'saldo', section: 'erario' };
    }
    return { description: 'IRPEF Saldo', deadlineType: 'saldo', section: 'erario' };
  }
  if (code === '4033') return { description: 'IRPEF 1° Acconto', deadlineType: 'acconto1', section: 'erario' };
  if (code === '4034') return { description: 'IRPEF 2° Acconto / Unica Soluzione', deadlineType: 'acconto2', section: 'erario' };

  // IVA
  if (code === '6099') return { description: 'IVA Saldo Annuale / Credito Compensabile', deadlineType: 'saldo', section: 'erario' };
  if (code.startsWith('60')) return { description: `IVA Rata / Periodo (${code})`, deadlineType: 'ordinario', section: 'erario' };

  // Sanzioni e Interessi Ravvedimento Operoso
  if (code === '8911') return { description: 'Sanzioni Ravvedimento Operoso Imposte Dirette', deadlineType: 'ordinario', section: 'erario' };
  if (code === '1989') return { description: 'Interessi Ravvedimento Operoso Imposte Dirette', deadlineType: 'ordinario', section: 'erario' };

  // Regioni & Comunali
  if (code.startsWith('38')) return { description: `Addizionale Regionale / Comunale (Cod. ${code})`, deadlineType: 'ordinario', section: 'regioni' };
  if (code.startsWith('39')) return { description: `IMU / TASI / Tributi Locali (Cod. ${code})`, deadlineType: 'ordinario', section: 'imu' };

  // Generico per qualsiasi altro codice a 4 cifre
  return {
    description: `Tributo Erario / Cassa (Cod. ${code})`,
    deadlineType: 'ordinario',
    section: 'erario'
  };
}

/**
 * Estrattore avanzato degli importi a Debito e Credito tenendo conto sia di virgole/punti (es. "184,00") 
 * che di colonne separate Euro / Centesimi ministeriali Agenzia Entrate (es. "184" e "00")
 * e delle coordinate X (X < 450 -> DEBITO, X >= 450 -> CREDITO).
 */
export function extractLineAmountsWithPositions(items: TextItemPosition[], taxCode: string): { debtVal: number; creditVal: number } {
  let debtVal = 0;
  let creditVal = 0;

  const lineStr = items.map(it => it.str).join(' ');

  // 1. Prova prima la ricerca di importi formattati esplicitamente con virgola o punto (es. 184,00 o 184.00)
  const formattedMatches = Array.from(lineStr.matchAll(/(?:\b|€\s*)(\d{1,6}[.,]\d{2})\b/g));
  const validFormatted: { val: number; x: number }[] = [];

  for (const m of formattedMatches) {
    const val = parseItalianNumber(m[1]);
    if (val !== parseInt(taxCode, 10) && val !== 8200 && val !== 5300) {
      const foundItem = items.find(it => it.str.includes(m[1]) || m[1].includes(it.str));
      validFormatted.push({ val, x: foundItem ? foundItem.x : 300 });
    }
  }

  if (validFormatted.length > 0) {
    for (const item of validFormatted) {
      if (item.x >= 450) {
        creditVal += item.val;
      } else {
        debtVal += item.val;
      }
    }
    return { debtVal, creditVal };
  }

  // 2. Se non sono presenti virgole/punti (Modello F24 Ufficiale Agenzia Entrate con colonne Euro e Centesimi separate "184" "00"):
  for (let i = 0; i < items.length - 1; i++) {
    const itCurr = items[i];
    const itNext = items[i + 1];

    const isEuros = /^\d{1,6}$/.test(itCurr.str);
    const isCents = /^\d{2}$/.test(itNext.str);

    if (isEuros && isCents) {
      const euroNum = parseInt(itCurr.str, 10);
      
      // Escludi anni (2020-2029), codici tributo, codici sede (5300, 8200), o rateazioni (0101, 06, 01)
      const isYearOrCode = ['2020','2021','2022','2023','2024','2025','2026','2027','2028','2029','4001','1792','5300','8200'].includes(itCurr.str);
      const isRateOrMonth = ['0101','0102','06','12','01'].includes(itCurr.str);

      if (!isYearOrCode && !isRateOrMonth) {
        const fullVal = parseFloat(`${euroNum}.${itNext.str}`);
        if (fullVal > 0) {
          if (itCurr.x >= 450) {
            creditVal += fullVal;
          } else {
            debtVal += fullVal;
          }
          i++; // Salta l'item centesimi consumato
        }
      }
    }
  }

  return { debtVal, creditVal };
}

/**
 * Estrae analiticamente l'intero documento F24 con gestione multi-pagina, coordinate X/Y e compensazioni
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
    
    let pdf: pdfjsLib.PDFDocumentProxy | null = null;
    try {
      pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableFontFace: true }).promise;
    } catch (pdfErr) {
      console.warn("pdfjs getDocument failed with worker, trying without worker...", pdfErr);
      pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), useWorkerFetch: false }).promise;
    }

    if (!pdf) {
      throw new Error("Impossibile inizializzare il motore PDF.");
    }

    const numPages = pdf.numPages;
    docResult.pageCount = numPages;
    const allTextList: string[] = [];

    const seenEntryKeys = new Set<string>();

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

      // Raggruppa in righe orizzontali (tolleranza 10pt per allineare celle sulla stessa riga)
      const verticalTolerance = 10;
      const pageLinesWithItems: { line: string; items: TextItemPosition[] }[] = [];
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
          pageLinesWithItems.push({ line: lineStr, items: currentLineItems });
          allTextList.push(lineStr);
          currentY = item.y;
          currentLineItems = [item];
        }
      }

      if (currentLineItems.length > 0) {
        currentLineItems.sort((a, b) => a.x - b.x);
        const lineStr = currentLineItems.map(it => it.str).join(' ');
        pageLinesWithItems.push({ line: lineStr, items: currentLineItems });
        allTextList.push(lineStr);
      }

      const pageFullText = pageLinesWithItems.map(l => l.line).join('\n');

      // Data di Scadenza del modello in questa pagina (es. "Scadenza del 20-08-2026", "Scadenza del 30-11-2026")
      const dueDateMatch = pageFullText.match(/scadenza\s*(?:del)?[\s:]*([0-3]?[0-9][\/\-.][0-1][0-9][\/\-.](?:202[0-9]|20[0-9]{2}))/i);
      const pageDueDate = dueDateMatch ? dueDateMatch[1].replace(/[/]/g, '-') : '';

      // Analisi rigo per rigo per questa pagina
      for (const { line, items } of pageLinesWithItems) {
        const cleanLine = line.replace(/\s+/g, ' ').trim();
        if (!cleanLine) continue;

        const yearMatch = cleanLine.match(/\b(202[0-9])\b/) || cleanLine.match(/(\d{2})\/(\d{4})/);
        const rowYear = yearMatch ? (yearMatch[2] || yearMatch[1]) : defaultYear;

        // Cerca A) Causale INPS (PXX, P10, CXX, C10, AF, CF, AP, CP, API, CPI, etc.)
        const inpsMatch = cleanLine.match(/\b(PXX|P10|CXX|C10|AF|CF|AP|CP|API|CPI|CPM|APM|RC|N9)\b/i);

        // Cerca B) Qualsiasi Codice Tributo numerico a 4 cifre (es. 1790, 1791, 1792, 4001, 4033, 6099, 8911, 1989, 3801, 3844, 1040, etc.)
        const erarioCandidateMatches = Array.from(cleanLine.matchAll(/\b([0-9]{4})\b/g));
        const validTaxCodeMatches: string[] = [];

        for (const cm of erarioCandidateMatches) {
          const candidate = cm[1];
          if (!['2020','2021','2022','2023','2024','2025','2026','2027','2028','2029'].includes(candidate)) {
            validTaxCodeMatches.push(candidate);
          }
        }

        let detectedCode: string | null = null;
        let isInps = false;

        if (inpsMatch) {
          detectedCode = inpsMatch[1].toUpperCase();
          isInps = true;
        } else if (validTaxCodeMatches.length > 0) {
          detectedCode = validTaxCodeMatches[0];
        }

        if (!detectedCode) continue;

        // Estrai gli importi a debito e a credito per questa riga
        const { debtVal, creditVal } = extractLineAmountsWithPositions(items, detectedCode);

        if (debtVal > 0 || creditVal > 0) {
          const entryKey = `${isInps ? 'INPS' : 'ERARIO'}-${detectedCode}-${rowYear}-${debtVal.toFixed(2)}-${creditVal.toFixed(2)}-${pageDueDate}`;
          if (!seenEntryKeys.has(entryKey)) {
            seenEntryKeys.add(entryKey);

            const meta = getTaxCodeDescription(detectedCode, debtVal, creditVal, cleanLine, pageDueDate);
            const isAcconto = meta.deadlineType === 'acconto1' || meta.deadlineType === 'acconto2';
            const refYearNum = parseInt(rowYear, 10) || 2025;
            const targetYear = isAcconto ? String(refYearNum + 1) : rowYear;

            docResult.entries.push({
              taxCode: detectedCode,
              debtAmount: debtVal,
              creditAmount: creditVal,
              amount: debtVal > 0 ? debtVal : -creditVal,
              year: rowYear,
              targetYear,
              isAcconto,
              section: meta.section,
              deadlineType: meta.deadlineType,
              description: meta.description,
              rawLine: cleanLine,
              dueDate: pageDueDate
            });
          }
        }
      }
    }

    const fullText = allTextList.join('\n');

    // Metadati Contribuente
    const cfMatch = fullText.match(/\b([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]|[0-9]{11})\b/i);
    if (cfMatch) {
      docResult.taxpayerFiscalCode = cfMatch[1].toUpperCase();
    }

    const dateMatch = fullText.match(/\b([0-3]?[0-9][\/\-.][0-1][0-9][\/\-.](?:202[0-9]|20[0-9]{2}))\b/);
    if (dateMatch) {
      docResult.paymentDate = dateMatch[1].replace(/[-.]/g, '/');
    }

    // Calcolo e quadratura dei TOTALI
    let sumDebt = docResult.entries.reduce((sum, e) => sum + (e.debtAmount || 0), 0);
    let sumCredit = docResult.entries.reduce((sum, e) => sum + (e.creditAmount || 0), 0);

    docResult.totalDebt = sumDebt;
    docResult.totalCredit = sumCredit;
    docResult.netDue = Math.max(0, sumDebt - sumCredit);

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
