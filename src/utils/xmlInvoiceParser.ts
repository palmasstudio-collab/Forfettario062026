/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Invoice } from '../types';

export interface ParsedInvoice {
  number: string;
  date: string;
  clientName: string;
  clientVat: string;
  amount: number;
  notes: string;
  hasStampDuty: boolean;
  issuerName?: string;
  issuerVat?: string;
  issuerCf?: string;
}

/**
 * Parses an Italian Electronic Invoice XML (Fattura Elettronica) using standard DOMParser.
 * Decodes client information (CessionarioCommittente) and general document data (Numero, Data, Importi).
 */
export function parseInvoiceXml(xmlContent: string): ParsedInvoice {
  const parser = new DOMParser();
  // Clean up any potential leading byte order marks or whitespace
  const sanitizedContent = xmlContent.trim();
  const xmlDoc = parser.parseFromString(sanitizedContent, 'application/xml');

  // Check for parser errors
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Formato XML non valido o file corrotto.');
  }

  // XML Tag Extraction Helper (case-insensitive fallback where appropriate)
  const getTagValue = (parent: Element | Document, tagNames: string[]): string => {
    for (const tag of tagNames) {
      const element = parent.querySelector(tag);
      if (element && element.textContent) {
        return element.textContent.trim();
      }
    }
    return '';
  };

  // --- SOGGETTO EMITTENTE (PROFESSIONISTA: CedentePrestatore) ---
  const cedente = xmlDoc.querySelector('CedentePrestatore');
  let issuerName = '';
  let issuerVat = '';
  let issuerCf = '';

  if (cedente) {
    const denominazione = getTagValue(cedente, ['Denominazione', 'denominazione']);
    if (denominazione) {
      issuerName = denominazione;
    } else {
      const nome = getTagValue(cedente, ['Nome', 'nome']);
      const cognome = getTagValue(cedente, ['Cognome', 'cognome']);
      if (nome || cognome) {
        issuerName = `${nome} ${cognome}`.trim();
      }
    }
    issuerVat = getTagValue(cedente, ['IdCodice', 'idCodice']);
    issuerCf = getTagValue(cedente, ['CodiceFiscale', 'codiceFiscale']);
  }

  // --- 1. SOGGETTI (CLIENTE: CessionarioCommittente) ---
  const cessionario = xmlDoc.querySelector('CessionarioCommittente');
  let clientName = '';
  let clientVat = '';

  if (cessionario) {
    // Customer Name extraction
    const denominazione = getTagValue(cessionario, ['Denominazione', 'denominazione']);
    if (denominazione) {
      clientName = denominazione;
    } else {
      const nome = getTagValue(cessionario, ['Nome', 'nome']);
      const cognome = getTagValue(cessionario, ['Cognome', 'cognome']);
      if (nome || cognome) {
        clientName = `${nome} ${cognome}`.trim();
      }
    }

    // Customer VAT or Fiscal Code extraction
    const vatCode = getTagValue(cessionario, ['IdCodice', 'idCodice', 'IdFiscaleIVA IdCodice']);
    const cfCode = getTagValue(cessionario, ['CodiceFiscale', 'codiceFiscale']);
    clientVat = vatCode || cfCode || '';
  }

  if (!clientName) {
    clientName = 'Cliente da Fattura XML';
  }

  // --- 2. DATI GENERALI DOCUMENTO ---
  const datiGenerali = xmlDoc.querySelector('DatiGeneraliDocumento');
  let number = '';
  let date = '';

  if (datiGenerali) {
    number = getTagValue(datiGenerali, ['Numero', 'numero']);
    date = getTagValue(datiGenerali, ['Data', 'data']);
  }

  // Fallback if not found in DatiGeneraliDocumento
  if (!number) number = getTagValue(xmlDoc, ['Numero', 'numero', 'NumeroFattura']) || 'XML-FAC';
  
  // Format Date to YYYY-MM-DD
  if (date) {
    // Dates from SDI can be YYYY-MM-DD, sometimes with custom formatting. Let's make sure it's valid
    const dateObj = new Date(date);
    if (!isNaN(dateObj.getTime())) {
      date = dateObj.toISOString().substring(0, 10);
    } else {
      date = new Date().toISOString().substring(0, 10);
    }
  } else {
    date = new Date().toISOString().substring(0, 10);
  }

  // --- 3. IMPORTO / BENI E SERVIZI ---
  // We prioritize payment detail amounts, then taxable base amounts
  let amount = 0;
  
  // Try: ImportoPagamento inside DettaglioPagamento
  const importoPagamentoStr = getTagValue(xmlDoc, ['ImportoPagamento', 'importoPagamento']);
  if (importoPagamentoStr) {
    amount = parseFloat(importoPagamentoStr);
  }

  // If not found or zero, try to sum the PrezzoTotale (line items)
  if (!amount || isNaN(amount)) {
    const lineItems = xmlDoc.querySelectorAll('DettaglioLinee');
    let sumLines = 0;
    lineItems.forEach(line => {
      const lineValStr = getTagValue(line, ['PrezzoTotale', 'prezzoTotale']);
      if (lineValStr) {
        const parsedLine = parseFloat(lineValStr);
        if (!isNaN(parsedLine)) {
          sumLines += parsedLine;
        }
      }
    });
    if (sumLines > 0) {
      amount = sumLines;
    }
  }

  // As a further fallback, check Imponibile
  if (!amount || isNaN(amount)) {
    const imponibileStr = getTagValue(xmlDoc, ['Imponibile', 'imponibile']);
    if (imponibileStr) {
      amount = parseFloat(imponibileStr);
    }
  }

  if (isNaN(amount) || amount < 0) {
    amount = 0;
  }

  // --- 4. DETTAGLI DI BOLLO (STAMP DUTY) ---
  const datiBollo = xmlDoc.querySelector('DatiBollo');
  const bolloVirtuale = getTagValue(xmlDoc, ['BolloVirtuale', 'bolloVirtuale']);
  const hasStampDuty = !!datiBollo || bolloVirtuale === 'SI' || amount > 77.47;

  // --- 5. INTERE PRESTAZIONI ---
  const causale = getTagValue(xmlDoc, ['Causale', 'causale']);
  const notes = causale || 'Importata da tracciato SDI Cassetto Fiscale XML';

  return {
    number,
    date,
    clientName,
    clientVat,
    amount,
    notes,
    hasStampDuty,
    issuerName,
    issuerVat,
    issuerCf,
  };
}
