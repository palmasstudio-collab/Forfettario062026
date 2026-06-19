import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as https from 'https';

const url = "https://www.istat.it/wp-content/uploads/2025/02/StrutturaATECO-2025-IT-EN-DE.xlsx";

https.get(url, (res) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Attempt to use the second sheet or loop till we find "ORDINE_CODICE_ATECO_2025" or similar
    const sheetName = workbook.SheetNames[1] || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    const data = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
    
    const validCodes: {code: string, description: string}[] = [];
    
    for (let i = 0; i < data.length; i++) {
       const row = data[i];
       
       let code = '';
       let desc = '';
       
       // Columns might be exact mapped: A: ordine, B: codice, C: titolo
       if (Array.isArray(row) && row.length >= 3) {
           const potentialCode = String(row[1] || '').trim();
           const potentialDesc = String(row[2] || '').trim();
           
           if (/^\d{2}\.\d{2}\.\d{2}$/.test(potentialCode)) {
               code = potentialCode;
               desc = potentialDesc;
           } else if (/^\d{2}\.\d{2}\.\d{2}$/.test(String(row[0] || '').trim())) {
               // Fallback if no layout match:
               code = String(row[0]).trim();
               desc = String(row[1]).trim();
           } else if (/^\d{2}\.\d{2}\.\d{2}$/.test(String(row[2] || '').trim())) {
               code = String(row[2]).trim();
               desc = String(row[3]).trim();
           }
       }
       
       if (code && desc) {
           validCodes.push({ code, description: desc });
       }
    }
    
    console.log(`Found ${validCodes.length} ATECO 6-digit codes.`);
    
    const outputContent = `// Auto-generated ATECO 2025 Database\n\nexport const ATECO_2025_REGISTRY = ${JSON.stringify(validCodes, null, 2)};`;
    
    fs.writeFileSync('./src/atecoDatabase.ts', outputContent);
    console.log('Successfully written to src/atecoDatabase.ts');
  });
}).on('error', (e) => {
  console.error("Error downloading XLSX:", e);
});
