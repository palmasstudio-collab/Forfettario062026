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
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
    
    for (let i = 0; i < 20; i++) {
        console.log(data[i]);
    }
  });
});
