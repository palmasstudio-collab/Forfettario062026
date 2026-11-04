/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Invoice, BusinessProfile, F24Entry } from '../types';
import { findAtecoCode, findPensionFund } from '../taxData';
import { calculateTaxReturn } from '../calculateTaxReturn';

export interface GoogleSheetsSyncResult {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  success: boolean;
  error?: string;
}

/**
 * Crea o aggiorna contestualmente il Google Sheet nella cartella Drive (Fatture Emesse)
 * Popola due fogli distinti:
 * 1) "Fatture Emesse": elenco completo di tutte le fatture XML (data, numero, cliente, importo, cassa, bollo)
 * 2) "Quadro LM - Calcolo Fiscale": modello ministeriale con formule e calcolo del reddito forfettario e imposta sostitutiva
 */
export async function syncInvoicesToGoogleSheet(
  accessToken: string,
  folderId: string,
  invoices: Invoice[],
  year: string,
  businessName: string,
  profile?: BusinessProfile,
  f24Entries: F24Entry[] = []
): Promise<GoogleSheetsSyncResult> {
  try {
    if (!accessToken) {
      throw new Error("Token di accesso Google mancante. Effettua l'accesso con Google.");
    }
    if (accessToken.includes('mock-')) {
      return {
        spreadsheetId: 'mock-sheet-' + year,
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/mock-sheet-' + year + '/edit',
        success: true
      };
    }

    const safeBusinessName = (businessName || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
    const sheetTitle = `Fatture_Emesse_Quadro_LM_${year}_${safeBusinessName}`;

    // 1. Cerca se esiste già un Google Sheet nella cartella
    const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and name contains 'Fatture_Emesse' and name contains '${year}' and trashed=false`;
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const searchData = await searchRes.json();

    let spreadsheetId = '';

    if (searchData.files && searchData.files.length > 0) {
      spreadsheetId = searchData.files[0].id;
    } else {
      // Crea un nuovo Google Sheet con 2 schede native
      const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: sheetTitle
          },
          sheets: [
            { properties: { title: 'Fatture Emesse', sheetId: 0 } },
            { properties: { title: 'Quadro LM - Calcolo Fiscale', sheetId: 1 } }
          ]
        })
      });
      const createData = await createRes.json();
      if (!createData.spreadsheetId) {
        throw new Error("Impossibile creare il Google Sheet su Drive: " + (createData.error?.message || 'Errore API'));
      }
      spreadsheetId = createData.spreadsheetId;

      // Sposta il foglio creato nella cartella dell'anno
      await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&removeParents=root`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }

    // 2. Verifica se le schede "Fatture Emesse" e "Quadro LM - Calcolo Fiscale" esistono nel file
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const metaData = await metaRes.json();
    const existingTitles: string[] = (metaData.sheets || []).map((s: any) => s.properties?.title);

    const requestsToAdd: any[] = [];
    if (!existingTitles.includes('Fatture Emesse') && !existingTitles.includes('Foglio1')) {
      requestsToAdd.push({ addSheet: { properties: { title: 'Fatture Emesse' } } });
    }
    if (!existingTitles.includes('Quadro LM - Calcolo Fiscale')) {
      requestsToAdd.push({ addSheet: { properties: { title: 'Quadro LM - Calcolo Fiscale' } } });
    }

    if (requestsToAdd.length > 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests: requestsToAdd })
      });
    }

    const invoicesSheetName = existingTitles.includes('Fatture Emesse') ? 'Fatture Emesse' : (existingTitles.includes('Foglio1') ? 'Foglio1' : 'Fatture Emesse');

    // 3. Calcolo parametri fiscali Quadro LM
    const currentAteco = findAtecoCode(profile?.atecoCode || '62.01.00');
    const atecoCoefficient = currentAteco.coefficient; // es. 0.67 o 0.78
    const isStartup = profile?.isStartup ?? true;
    const taxRate = isStartup ? 0.05 : 0.15;

    // Calcolo totale cassa da fatture pagate
    const paidInvoices = invoices.filter(inv => inv.isPaid);
    const totalCashRevenue = paidInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalIssuedRevenue = invoices.reduce((sum, inv) => sum + inv.amount, 0);

    // Contributi deducibili versati da F24 nell'anno selezionato
    const deductibleContributions = f24Entries
      .filter(e => !['2501', '2524', '1790', '1791', '1792'].includes(e.taxCode))
      .reduce((sum, e) => sum + (e.debtAmount !== undefined ? e.debtAmount : e.amount), 0);

    // Acconti imposta sostitutiva versati
    const substituteAdvancesPaid = f24Entries
      .filter(e => e.taxCode === '1790' || e.taxCode === '1791')
      .reduce((sum, e) => sum + (e.debtAmount !== undefined ? e.debtAmount : e.amount), 0);

    const grossTaxableIncome = Math.round(totalCashRevenue * atecoCoefficient * 100) / 100;
    const netTaxableIncome = Math.max(0, Math.round((grossTaxableIncome - deductibleContributions) * 100) / 100);
    const substituteTaxDue = Math.round(netTaxableIncome * taxRate * 100) / 100;
    const substituteTaxBalance = Math.max(0, Math.round((substituteTaxDue - substituteAdvancesPaid) * 100) / 100);

    // 4. Prepara dati per Foglio 1: "Fatture Emesse"
    const invoiceRows = invoices.map(inv => [
      inv.number,
      inv.date,
      inv.clientName,
      inv.clientVat || '',
      inv.amount,
      inv.isPaid ? 'SI' : 'NO',
      inv.hasStampDuty ? 'SI' : 'NO',
      inv.notes || ''
    ]);

    const lastDataRow = 4 + invoiceRows.length;
    const invoicesSheetValues = [
      ['REGISTRO FATTURE EMESSE - ANNO ' + year, '', '', '', '', '', '', ''],
      ['Contribuente:', businessName, 'Partita IVA:', profile?.vatNumber || '', 'Codice Fiscale:', profile?.fiscalCode || '', 'Generato il:', new Date().toLocaleString('it-IT')],
      ['', '', '', '', '', '', '', ''],
      ['Numero Fattura', 'Data Emissione', 'Denominazione Cliente', 'P.IVA / C.F. Cliente', 'Importo Lordo (€)', 'Incassata (Cassa)', 'Marca da Bollo (2€)', 'Note / Oggetto'],
      ...invoiceRows,
      ['', '', '', '', '', '', '', ''],
      [
        'TOTALE FATTURATO EMESSO',
        '',
        '',
        '',
        invoiceRows.length > 0 ? `=SUM(E5:E${lastDataRow})` : 0,
        'TOTALE CASSA (INCASSATO):',
        invoiceRows.length > 0 ? `=SUMIF(F5:F${lastDataRow}, "SI", E5:E${lastDataRow})` : 0,
        ''
      ]
    ];

    // 5. Prepara dati per Foglio 2: "Quadro LM - Calcolo Fiscale"
    const quadroLmValues = [
      ['MODELLO REDDITI PF - QUADRO LM - REGIME FORFETTARIO (L. 190/2014)', '', 'RIF. NORMATIVO / FORMULA'],
      ['Esercizio Fiscale:', year, 'Art. 1, commi 54-89, L. 190/2014'],
      ['Contribuente:', businessName, ''],
      ['Partita IVA:', profile?.vatNumber || '', ''],
      ['Codice Fiscale:', profile?.fiscalCode || '', ''],
      ['Codice ATECO:', `${currentAteco.code} - ${currentAteco.description}`, `Coefficiente di redditività: ${(atecoCoefficient * 100)}%`],
      ['Regime Fiscale:', isStartup ? 'Regime Start-up 5% (Primi 5 anni)' : 'Regime Forfettario Ordinario 15%', ''],
      ['', '', ''],
      ['QUADRO LM - DETERMINAZIONE DEL REDDITO E IMPOSTA SOSTITUTIVA', 'IMPORTO (€)', 'METODO DI CALCOLO'],
      ['LM22 - Totale Componenti Positivi / Compensi Incassati (Principio di Cassa)', totalCashRevenue, `='${invoicesSheetName}'!G${lastDataRow + 2}`],
      ['Verifica Limite Ricavi (Soglia 85.000 €)', totalCashRevenue <= 85000 ? 'CONFORME (≤ 85.000 €)' : 'ATTENZIONE: SUPERATO LIMITE 85.000 €', 'Permanenza regime forfettario'],
      ['LM34 (col. 1) - Coefficiente di Redditività', `${(atecoCoefficient * 100)}%`, currentAteco.code],
      ['LM34 (col. 2) - Reddito Lordo della Gestione Forfettaria', grossTaxableIncome, '=B10*(VALORE_NUMERICO_COEFF)'],
      ['LM35 - Contributi Previdenziali ed Assistenziali Deducibili (Quietanza F24)', deductibleContributions, 'Versati per cassa nel corso del ' + year],
      ['LM36 - Reddito Forfettario Netto (Base Imponibile)', netTaxableIncome, '=MAX(0, B13-B14)'],
      ['LM37 - Aliquota Imposta Sostitutiva', isStartup ? '5%' : '15%', isStartup ? 'Aliquota agevolata nuova attività' : 'Aliquota standard'],
      ['LM38 - Imposta Sostitutiva Lorda Dovuta', substituteTaxDue, '=ROUND(B15 * Aliquota, 2)'],
      ['LM40 - Acconti Imposta Sostitutiva versati (F24 Cod. 1790 + 1791)', substituteAdvancesPaid, 'Acconti scomputabili'],
      ['LM42 - Saldo Netto Imposta Sostitutiva a Debito', substituteTaxBalance, '=MAX(0, B17-B18)'],
      ['', '', ''],
      ['RIASSUNTO LIQUIDAZIONE CASSA & TRIBUTI', '', ''],
      ['Fatturato Totale Emesso nel ' + year, totalIssuedRevenue, `='${invoicesSheetName}'!E${lastDataRow + 2}`],
      ['Fatturato Effettivamente Incassato (Cassa)', totalCashRevenue, 'Base per Quadro LM'],
      ['Crediti da Incassare (Fatture non ancora saldate)', totalIssuedRevenue - totalCashRevenue, 'Escluse dal calcolo cassa'],
      ['Ultimo aggiornamento automatico gestionale:', new Date().toLocaleString('it-IT'), 'Sincronizzato da file XML']
    ];

    // 6. Esegui la scrittura contemporanea con batchUpdate dei valori
    const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `'${invoicesSheetName}'!A1`,
            majorDimension: 'ROWS',
            values: invoicesSheetValues
          },
          {
            range: `'Quadro LM - Calcolo Fiscale'!A1`,
            majorDimension: 'ROWS',
            values: quadroLmValues
          }
        ]
      })
    });

    const updateData = await updateRes.json();
    if (updateData.error) {
      throw new Error(updateData.error.message || 'Errore scrittura dati Google Sheets');
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
    if (accessToken.includes('mock-')) return [];
    
    // Prova prima con il nome personalizzato "Fatture Emesse", poi con "Foglio1"
    let res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Fatture Emesse'!A5:H1000`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    let data = await res.json();
    
    if (!data.values || data.error) {
      res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Foglio1!A2:H1000`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      data = await res.json();
    }

    if (!data.values) return [];

    const invoices: Invoice[] = data.values
      .filter((row: any[]) => row && row[0] && row[0].toString().trim() !== '' && !row[0].toString().includes('TOTALE'))
      .map((row: any[], idx: number) => ({
        id: `gsheet-${idx}-${row[0] || idx}`,
        number: String(row[0] || ''),
        date: String(row[1] || new Date().toISOString().substring(0, 10)),
        clientName: String(row[2] || 'Cliente'),
        clientVat: String(row[3] || ''),
        amount: parseFloat(String(row[4]).replace(/[^0-9.-]+/g, '')) || 0,
        isPaid: row[5] === 'SI' || row[5] === true || row[5] === 'true',
        hasStampDuty: row[6] === 'SI' || row[6] === true || row[6] === 'true',
        notes: String(row[7] || '')
      }));

    return invoices;
  } catch (err) {
    console.error("Errore lettura fatture da Google Sheets:", err);
    return [];
  }
}
