/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Invoice } from '../types';

interface GoogleSheetsSyncResult {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  success: boolean;
  error?: string;
}

/**
 * Crea o aggiorna un Google Sheet nella cartella Drive specificata (Fatture Emesse) 
 * e vi scrive tutti i dati delle fatture estratte dagli XML.
 */
export async function syncInvoicesToGoogleSheet(
  accessToken: string,
  folderId: string,
  invoices: Invoice[],
  year: string,
  businessName: string
): Promise<GoogleSheetsSyncResult> {
  try {
    if (!accessToken) {
      throw new Error("Token di accesso Google mancante. Effettua l'accesso con Google.");
    }

    // 1. Cerca se esiste già un Google Sheet di riepilogo "Fatture_Emesse_Anno_{year}" nella cartella
    const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and name contains 'Fatture_Emesse_${year}' and trashed=false`;
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const searchData = await searchRes.json();

    let spreadsheetId = '';

    if (searchData.files && searchData.files.length > 0) {
      spreadsheetId = searchData.files[0].id;
    } else {
      // Crea un nuovo Google Sheet
      const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: `Fatture_Emesse_${year}_${businessName.replace(/[^a-zA-Z0-9]/g, '_')}`
          }
        })
      });
      const createData = await createRes.json();
      if (!createData.spreadsheetId) {
        throw new Error("Impossibile creare il Google Sheet su Drive.");
      }
      spreadsheetId = createData.spreadsheetId;

      // Sposta il file nella cartella specifica se necessario tramite Drive API
      // (al momento della creazione in root, lo spostiamo nella cartella folderId)
      await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&removeParents=root`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }

    // 2. Prepara i dati delle fatture da scrivere nel foglio (Header + Righe)
    const values = [
      ['Numero Fattura', 'Data', 'Cliente', 'Partita IVA / CF Cliente', 'Importo (€)', 'Incassata (Cassa)', 'Marca da Bollo', 'Note / Causale'],
      ...invoices.map(inv => [
        inv.number,
        inv.date,
        inv.clientName,
        inv.clientVat || '',
        inv.amount,
        inv.isPaid ? 'SI' : 'NO',
        inv.hasStampDuty ? 'SI' : 'NO',
        inv.notes || ''
      ])
    ];

    // 3. Scrivi i dati nel foglio Google Sheets (Foglio1!A1)
    const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Foglio1!A1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: 'Foglio1!A1',
        majorDimension: 'ROWS',
        values
      })
    });

    const updateData = await updateRes.json();
    if (updateData.error) {
      throw new Error(updateData.error.message || 'Errore scrittura Google Sheets');
    }

    return {
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      success: true
    };
  } catch (err: any) {
    console.error("Errore sincronizzazione Google Sheets:", err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Legge le fatture direttamente da Google Sheets (per i calcoli fiscali)
 */
export async function fetchInvoicesFromGoogleSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<Invoice[]> {
  try {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Foglio1!A2:H1000`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (!data.values) return [];

    const invoices: Invoice[] = data.values.map((row: any[], idx: number) => ({
      id: `gsheet-${idx}-${row[0] || idx}`,
      number: row[0] || '',
      date: row[1] || new Date().toISOString().substring(0, 10),
      clientName: row[2] || 'Cliente',
      clientVat: row[3] || '',
      amount: parseFloat(row[4]) || 0,
      isPaid: row[5] === 'SI' || row[5] === true || row[5] === 'true',
      hasStampDuty: row[6] === 'SI' || row[6] === true || row[6] === 'true',
      notes: row[7] || ''
    }));

    return invoices;
  } catch (err) {
    console.error("Errore lettura fatture da Google Sheets:", err);
    return [];
  }
}
