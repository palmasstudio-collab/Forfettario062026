import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ParsedF24Entry {
  taxCode: string;
  amount: number;
  year?: string;
}

export async function extractF24DataFromPdf(file: File): Promise<ParsedF24Entry[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const entries: ParsedF24Entry[] = [];

    // Match patterns for F24 line items
    // Standard Italian tax codes are 4-digit numeric (e.g., 4001, 1792) or specific letters (e.g. RR, AP, CP, codici contributi)
    // We match standard 4-character codes or words, reference year (4 digits), and amount (Italian with comma, or decimal with dot)
    const regexPatterns = [
      // 1. Tax code (4 chars/digits), then any text, reference year (4 digits), then any text, amount with decimals (e.g., 123,45 or 1,234.56)
      /\b([A-Z0-9]{4}|RR|AP|CP)\b.*?\b(\d{4})\b.*?\b([\d.]+,\d{2}|\d+\.\d{2})\b/gi,
      // 2. Fallback for tax code and amount without a clear reference year or year elsewhere
      /\b(1790|1791|1792|4001|4002|4003|1668|3800|3801|3802|8911|3847|3848)\b.*?\b([\d.]+,\d{2}|\d+\.\d{2})\b/gi
    ];

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items as any[];
      
      // Sort items vertically (by Y coordinate descending)
      items.sort((a, b) => b.transform[5] - a.transform[5]);
      
      // Group text items by line using a vertical tolerance of 12 points
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
          // Sort items in the same line by X coordinate (transform[4]) to read left-to-right!
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

      // Process each reconstructed line
      const seenOnPage = new Set<string>(); // avoid duplicates on the same page/line slot
      for (const line of lines) {
        const sanitizedLine = line.replace(/\s+/g, ' ').trim();
        
        for (const pattern of regexPatterns) {
          pattern.lastIndex = 0; // reset regex index
          let match;
          
          while ((match = pattern.exec(sanitizedLine)) !== null) {
            let taxCode = match[1].toUpperCase();
            let year = '';
            let amountStr = '';
            
            if (match.length === 4) {
              // Pattern with year: taxCode (1), year (2), amount (3)
              year = match[2];
              amountStr = match[3];
            } else {
              // Pattern without year: taxCode (1), amount (2)
              year = new Date().getFullYear().toString();
              amountStr = match[2];
            }
            
            // Clean tax code (must be alphanumeric, 2-5 chars)
            taxCode = taxCode.trim();
            if (taxCode.length < 2 || taxCode.length > 5) continue;
            
            // Parse amount string (remove dots, replace comma with dot)
            let cleanAmountStr = amountStr;
            if (cleanAmountStr.includes(',') && cleanAmountStr.includes('.')) {
              // Italian style with dot thousands and comma decimals: 1.250,50
              cleanAmountStr = cleanAmountStr.replace(/\./g, '').replace(',', '.');
            } else if (cleanAmountStr.includes(',')) {
              // Italian style with comma decimals: 250,50
              cleanAmountStr = cleanAmountStr.replace(',', '.');
            }
            
            const amount = parseFloat(cleanAmountStr);
            if (!isNaN(amount) && amount > 0) {
              const key = `${taxCode}-${year}-${amount}`;
              if (!seenOnPage.has(key)) {
                seenOnPage.add(key);
                entries.push({ taxCode, year, amount });
              }
            }
          }
        }
      }
    }

    // Robust global fallback parsing the entire raw text block
    if (entries.length === 0) {
       const fullText = (await Promise.all(
         Array.from({ length: numPages }, async (_, i) => {
           const page = await pdf.getPage(i + 1);
           const textContent = await page.getTextContent();
           return textContent.items.map((it: any) => it.str).join(' ');
         })
       )).join(' ').replace(/\s+/g, ' ');

       for (const pattern of regexPatterns) {
         pattern.lastIndex = 0;
         let match;
         while ((match = pattern.exec(fullText)) !== null) {
           let taxCode = match[1].toUpperCase().trim();
           let year = match.length === 4 ? match[2] : new Date().getFullYear().toString();
           let amountStr = match.length === 4 ? match[3] : match[2];
           
           let cleanAmountStr = amountStr;
           if (cleanAmountStr.includes(',') && cleanAmountStr.includes('.')) {
             cleanAmountStr = cleanAmountStr.replace(/\./g, '').replace(',', '.');
           } else if (cleanAmountStr.includes(',')) {
             cleanAmountStr = cleanAmountStr.replace(',', '.');
           }
           
           const amount = parseFloat(cleanAmountStr);
           if (!isNaN(amount) && amount > 0 && taxCode.length >= 2 && taxCode.length <= 5) {
             entries.push({ taxCode, year, amount });
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
