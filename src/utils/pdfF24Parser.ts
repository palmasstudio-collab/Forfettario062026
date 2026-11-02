import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ParsedF24Entry {
  taxCode: string; // Codice tributo (es. 1792, 1790, 1791) o causale INPS (PXX, P10, AP, etc.)
  amount: number;
  year?: string;
  section?: 'erario' | 'inps' | 'regioni' | 'altri';
  periodFrom?: string;
  periodTo?: string;
  rateCode?: string;
  description?: string;
  deadlineType?: 'saldo' | 'acconto1' | 'acconto2' | 'ordinario';
}

const KNOWN_ERARIO_CODES = ['1790', '1791', '1792', '4001', '4002', '4003', '1668', '3800', '3801', '3802', '8911', '1989', '3847', '3848'];
const KNOWN_INPS_CODES = ['PXX', 'P10', 'CXX', 'C10', 'AF', 'CF', 'AP', 'CP', 'API', 'CPI', 'CPM', 'APM'];

/**
 * Pulisce una stringa di importo italiano o decimale convertendola in float.
 * Esempi supportati: "46,00", "68,00", "1.250,50", "46.00", "68.00"
 */
function parseItalianNumber(val: string): number {
  if (!val) return 0;
  let clean = val.trim();
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

export async function extractF24DataFromPdf(file: File): Promise<ParsedF24Entry[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const entries: ParsedF24Entry[] = [];
    const seenKeys = new Set<string>();

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items as any[];
      
      // Ordina gli elementi per coordinata Y (dall'alto in basso)
      items.sort((a, b) => b.transform[5] - a.transform[5]);
      
      // Raggruppa gli elementi per riga (tolleranza verticale 12pt)
      const verticalTolerance = 12;
      const lines: string[] = [];
      let currentY: number | null = null;
      let currentLineItems: any[] = [];

      for (const item of items) {
        if (!item.str || !item.str.trim()) continue;
        const y = item.transform[5];
        
        if (currentY === null) {
          currentY = y;
          currentLineItems.push(item);
        } else if (Math.abs(currentY - y) <= verticalTolerance) {
          currentLineItems.push(item);
        } else {
          // Ordina da sinistra a destra sulla riga
          currentLineItems.sort((a, b) => a.transform[4] - b.transform[4]);
          lines.push(currentLineItems.map(it => it.str).join(' '));
          currentY = y;
          currentLineItems = [item];
        }
      }
      if (currentLineItems.length > 0) {
        currentLineItems.sort((a, b) => a.transform[4] - b.transform[4]);
        lines.push(currentLineItems.map(it => it.str).join(' '));
      }

      // Analisi linea per linea con regex mirate
      for (const rawLine of lines) {
        const line = rawLine.replace(/\s+/g, ' ').trim();
        if (!line) continue;

        // 1. Cerca Sezione INPS: Causale PXX, P10, AF, CF, AP, CP ecc.
        const inpsMatch = line.match(/\b(PXX|P10|CXX|C10|AF|CF|AP|CP|API|CPI)\b/i);
        if (inpsMatch) {
          const taxCode = inpsMatch[1].toUpperCase();
          // Cerca importo nella riga (es. 46,00 o 68,00 o 850,00)
          const amountMatches = Array.from(line.matchAll(/\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})\b/g));
          // Cerca anno o periodo (es. 2024, 2025, 2026 o 01/2025 o 012025)
          const yearMatch = line.match(/\b(202[0-9])\b/) || line.match(/(\d{2})\/(\d{4})/);
          const detectedYear = yearMatch ? (yearMatch[2] || yearMatch[1]) : new Date().getFullYear().toString();

          for (const am of amountMatches) {
            const amountVal = parseItalianNumber(am[1]);
            // Filtra numeri che potrebbero essere codici di sede come 8200
            if (amountVal > 0 && amountVal !== 8200) {
              const entryKey = `INPS-${taxCode}-${detectedYear}-${amountVal.toFixed(2)}`;
              if (!seenKeys.has(entryKey)) {
                seenKeys.add(entryKey);
                
                let deadlineType: 'saldo' | 'acconto1' | 'acconto2' | 'ordinario' = 'ordinario';
                let description = `INPS ${taxCode} Gestione Previdenziale`;
                
                if (taxCode === 'PXX' || taxCode === 'P10') {
                  if (amountVal <= 50 || line.includes('06') || line.includes('GIU') || line.toLowerCase().includes('primo')) {
                    deadlineType = 'acconto1';
                    description = `INPS ${taxCode} - 1° Acconto (40% Scadenza Giugno)`;
                  } else if (amountVal > 50 || line.includes('11') || line.includes('NOV') || line.toLowerCase().includes('secondo')) {
                    deadlineType = 'acconto2';
                    description = `INPS ${taxCode} - 2° Acconto (60% Scadenza Novembre)`;
                  } else {
                    description = `INPS ${taxCode} Gestione Separata`;
                  }
                }

                entries.push({
                  taxCode,
                  amount: amountVal,
                  year: detectedYear,
                  section: 'inps',
                  deadlineType,
                  description
                });
              }
            }
          }
        }

        // 2. Cerca Sezione Erario: 1792, 1790, 1791, 4001, 8911, 1989 ecc.
        const erarioMatch = line.match(/\b(1790|1791|1792|4001|4002|4003|1668|3800|3801|3802|8911|1989|3847|3848)\b/);
        if (erarioMatch) {
          const taxCode = erarioMatch[1];
          const yearMatch = line.match(/\b(202[0-9])\b/);
          const detectedYear = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
          
          // Cerca importo nella riga
          const amountMatches = Array.from(line.matchAll(/\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})\b/g));
          for (const am of amountMatches) {
            const amountVal = parseItalianNumber(am[1]);
            if (amountVal > 0 && amountVal !== parseInt(taxCode, 10)) {
              const entryKey = `ERARIO-${taxCode}-${detectedYear}-${amountVal.toFixed(2)}`;
              if (!seenKeys.has(entryKey)) {
                seenKeys.add(entryKey);

                let deadlineType: 'saldo' | 'acconto1' | 'acconto2' | 'ordinario' = 'ordinario';
                let description = `Erario Cod. ${taxCode}`;

                if (taxCode === '1792') {
                  deadlineType = 'saldo';
                  description = `Imposta Sostitutiva - Saldo (${detectedYear})`;
                } else if (taxCode === '1790') {
                  deadlineType = 'acconto1';
                  description = `Imposta Sostitutiva - 1° Acconto (${detectedYear})`;
                } else if (taxCode === '1791') {
                  deadlineType = 'acconto2';
                  description = `Imposta Sostitutiva - 2° Acconto / Unica Soluz. (${detectedYear})`;
                } else if (taxCode === '8911') {
                  description = `Sanzioni Ravvedimento Operoso (Cod. 8911)`;
                } else if (taxCode === '1989') {
                  description = `Interessi Ravvedimento Operoso (Cod. 1989)`;
                }

                entries.push({
                  taxCode,
                  amount: amountVal,
                  year: detectedYear,
                  section: 'erario',
                  deadlineType,
                  description
                });
              }
            }
          }
        }
      }
    }

    // Se l'analisi riga per riga non ha trovato tributi (ad es. PDF con testo continuo), esegui scansione full-text globale
    if (entries.length === 0) {
      const fullText = (await Promise.all(
        Array.from({ length: numPages }, async (_, i) => {
          const page = await pdf.getPage(i + 1);
          const textContent = await page.getTextContent();
          return textContent.items.map((it: any) => it.str).join(' ');
        })
      )).join(' ').replace(/\s+/g, ' ');

      // Controlla codici INPS (PXX, P10)
      const inpsGlobalMatches = Array.from(fullText.matchAll(/\b(PXX|P10|AF|CF|AP|CP)\b[^\d]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/gi));
      for (const m of inpsGlobalMatches) {
        const taxCode = m[1].toUpperCase();
        const amountVal = parseItalianNumber(m[2]);
        if (amountVal > 0 && amountVal !== 8200) {
          const entryKey = `INPS-${taxCode}-${amountVal.toFixed(2)}`;
          if (!seenKeys.has(entryKey)) {
            seenKeys.add(entryKey);
            entries.push({
              taxCode,
              amount: amountVal,
              year: new Date().getFullYear().toString(),
              section: 'inps',
              deadlineType: amountVal <= 50 ? 'acconto1' : 'acconto2',
              description: `INPS ${taxCode} (${amountVal <= 50 ? '40% Giugno' : '60% Novembre'})`
            });
          }
        }
      }

      // Controlla codici Erario
      const erarioGlobalMatches = Array.from(fullText.matchAll(/\b(1790|1791|1792|4001|8911|1989)\b[^\d]*(\d{4})?[^\d]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/gi));
      for (const m of erarioGlobalMatches) {
        const taxCode = m[1];
        const detectedYear = m[2] || new Date().getFullYear().toString();
        const amountVal = parseItalianNumber(m[3]);
        if (amountVal > 0 && amountVal !== parseInt(taxCode, 10)) {
          const entryKey = `ERARIO-${taxCode}-${amountVal.toFixed(2)}`;
          if (!seenKeys.has(entryKey)) {
            seenKeys.add(entryKey);
            entries.push({
              taxCode,
              amount: amountVal,
              year: detectedYear,
              section: 'erario',
              description: `Tributo Erario ${taxCode}`
            });
          }
        }
      }
    }

    return entries;
  } catch (err) {
    console.warn("Global catch in F24 PDF extraction:", err);
    return [];
  }
}
