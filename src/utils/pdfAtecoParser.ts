import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Imposta il worker localmente per evitare problemi di build e CDN mancante
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ParsedAteco {
  code: string;
  description: string;
}

export async function extractAtecoFromPdf(file: File): Promise<ParsedAteco[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const extractedCodes: ParsedAteco[] = [];

  // Regex per catturare una linea che inizia con 6 cifre puntate: es 12.34.56
  const codeRegex = /^(\d{2}\.\d{2}\.\d{2})\s+(.+)$/;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as any[];
    
    // Raggruppiamo gli item per la loro coordinata Y per formare le righe
    const linesMap = new Map<number, string[]>();
    for (const item of items) {
      if (!item.str) continue;
      // Arrotondiamo la Y per gestire lievi disallineamenti nella stessa riga
      const y = Math.round(item.transform[5]);
      if (!linesMap.has(y)) {
        linesMap.set(y, []);
      }
      linesMap.get(y)!.push(item.str);
    }
    
    // Ordiniamo le righe dall'alto verso il basso (Y decrescente)
    const lines = Array.from(linesMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([y, strings]) => strings.join(' ').replace(/\s+/g, ' ').trim());

    for (const line of lines) {
      const match = line.match(codeRegex);
      if (match) {
        extractedCodes.push({
          code: match[1],
          description: match[2].trim(),
        });
      }
    }
  }

  // Rimuovi eventuali duplicati
  const uniqueCodes = new Map<string, string>();
  for (const code of extractedCodes) {
    uniqueCodes.set(code.code, code.description);
  }

  return Array.from(uniqueCodes.entries()).map(([code, description]) => ({
    code,
    description
  })).sort((a, b) => a.code.localeCompare(b.code));
}
