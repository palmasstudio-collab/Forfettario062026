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
 * Trova un elemento nel DOM ignorando i prefissi di namespace XML (es. p:DatiGeneraliDocumento, ns2:Numero)
 */
function findElement(parent: Element | Document | null, localName: string): Element | null {
  if (!parent) return null;

  // 1. Prova prima querySelector diretto
  try {
    let el = parent.querySelector(localName);
    if (el) return el;
  } catch (e) {}

  // 2. Prova selector wildcard di namespace (*|localName)
  try {
    let el = parent.querySelector(`*|${localName}`);
    if (el) return el;
  } catch (e) {}

  // 3. Fallback universale: scansione nodi DOM con localName
  const allElements = parent.getElementsByTagName('*');
  const lowerName = localName.toLowerCase();
  for (let i = 0; i < allElements.length; i++) {
    const node = allElements[i];
    if (node.localName === localName || node.localName.toLowerCase() === lowerName) {
      return node;
    }
  }
  return null;
}

/**
 * Trova tutti gli elementi che corrispondono al localName ignorando i namespace XML
 */
function findElements(parent: Element | Document | null, localName: string): Element[] {
  if (!parent) return [];
  const result: Element[] = [];
  const allElements = parent.getElementsByTagName('*');
  const lowerName = localName.toLowerCase();
  for (let i = 0; i < allElements.length; i++) {
    const node = allElements[i];
    if (node.localName === localName || node.localName.toLowerCase() === lowerName) {
      result.push(node);
    }
  }
  return result;
}

/**
 * Estrae il valore di testo del primo tag trovato tra una lista di nomi possibili
 */
function getTagValue(parent: Element | Document | null, tagNames: string[]): string {
  if (!parent) return '';
  for (const tag of tagNames) {
    const element = findElement(parent, tag);
    if (element && element.textContent && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }
  return '';
}

/**
 * Pulisce e formatta una data XML (ISO, IT o compatta) nel formato YYYY-MM-DD
 */
export function parseXmlDate(rawDateStr: string): string {
  if (!rawDateStr) return new Date().toISOString().substring(0, 10);
  const clean = rawDateStr.trim();

  // YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss
  const isoMatch = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const itMatch = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (itMatch) {
    const d = itMatch[1].padStart(2, '0');
    const m = itMatch[2].padStart(2, '0');
    const y = itMatch[3];
    return `${y}-${m}-${d}`;
  }

  // YYYYMMDD
  const compactMatch = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  return clean.substring(0, 10);
}

/**
 * Converte stringhe di importo XML (con punto o virgola) in float numerico
 */
export function parseXmlAmount(valStr: string): number {
  if (!valStr) return 0;
  let clean = valStr.trim().replace(/€/g, '').replace(/[\s\xa0]+/g, '');
  if (clean.includes(',') && !clean.includes('.')) {
    clean = clean.replace(',', '.');
  } else if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

/**
 * Decodifica completa ed esaustiva di una Fattura Elettronica XML italiana (SDI)
 */
export function parseInvoiceXml(xmlContent: string): ParsedInvoice {
  const parser = new DOMParser();
  const sanitizedContent = xmlContent.trim();
  const xmlDoc = parser.parseFromString(sanitizedContent, 'application/xml');

  // Verifica errori di sintassi XML
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Formato XML non valido o file corrotto.');
  }

  // --- SOGGETTO EMITTENTE (CedentePrestatore) ---
  const cedente = findElement(xmlDoc, 'CedentePrestatore');
  let issuerName = '';
  let issuerVat = '';
  let issuerCf = '';

  if (cedente) {
    const denominazione = getTagValue(cedente, ['Denominazione']);
    if (denominazione) {
      issuerName = denominazione;
    } else {
      const nome = getTagValue(cedente, ['Nome']);
      const cognome = getTagValue(cedente, ['Cognome']);
      if (nome || cognome) {
        issuerName = `${nome} ${cognome}`.trim();
      }
    }
    issuerVat = getTagValue(cedente, ['IdCodice']);
    issuerCf = getTagValue(cedente, ['CodiceFiscale']);
  }

  // --- SOGGETTO CLIENTE (CessionarioCommittente) ---
  const cessionario = findElement(xmlDoc, 'CessionarioCommittente');
  let clientName = '';
  let clientVat = '';

  if (cessionario) {
    const denominazione = getTagValue(cessionario, ['Denominazione']);
    if (denominazione) {
      clientName = denominazione;
    } else {
      const nome = getTagValue(cessionario, ['Nome']);
      const cognome = getTagValue(cessionario, ['Cognome']);
      if (nome || cognome) {
        clientName = `${nome} ${cognome}`.trim();
      }
    }
    const vatCode = getTagValue(cessionario, ['IdCodice']);
    const cfCode = getTagValue(cessionario, ['CodiceFiscale']);
    clientVat = vatCode || cfCode || '';
  }

  if (!clientName) {
    clientName = 'Cliente da Fattura XML';
  }

  // --- DATI GENERALI DOCUMENTO (DatiGeneraliDocumento) ---
  const datiGenerali = findElement(xmlDoc, 'DatiGeneraliDocumento');
  let number = '';
  let rawDate = '';

  if (datiGenerali) {
    number = getTagValue(datiGenerali, ['Numero']);
    rawDate = getTagValue(datiGenerali, ['Data']);
  }

  if (!number) {
    number = getTagValue(xmlDoc, ['Numero']) || 'Fattura XML';
  }

  const date = parseXmlDate(rawDate);

  // --- IMPORTO DOCUMENTO ---
  let amount = 0;

  // 1. Prova ImportoTotaleDocumento in DatiGeneraliDocumento
  if (datiGenerali) {
    const totDocStr = getTagValue(datiGenerali, ['ImportoTotaleDocumento']);
    if (totDocStr) {
      amount = parseXmlAmount(totDocStr);
    }
  }

  // 2. Prova ImportoPagamento in DettaglioPagamento
  if (!amount) {
    const importoPagamentoStr = getTagValue(xmlDoc, ['ImportoPagamento']);
    if (importoPagamentoStr) {
      amount = parseXmlAmount(importoPagamentoStr);
    }
  }

  // 3. Prova a sommare i PrezzoTotale delle righe DettaglioLinee
  if (!amount) {
    const lineItems = findElements(xmlDoc, 'DettaglioLinee');
    let sumLines = 0;
    lineItems.forEach(line => {
      const lineValStr = getTagValue(line, ['PrezzoTotale']);
      if (lineValStr) {
        const parsedLine = parseXmlAmount(lineValStr);
        if (parsedLine > 0) {
          sumLines += parsedLine;
        }
      }
    });
    if (sumLines > 0) {
      amount = sumLines;
    }
  }

  // 4. Prova ImponibileImporto / Imponibile
  if (!amount) {
    const imponibileStr = getTagValue(xmlDoc, ['ImponibileImporto', 'Imponibile']);
    if (imponibileStr) {
      amount = parseXmlAmount(imponibileStr);
    }
  }

  // --- MARCA DA BOLLO ---
  const datiBollo = findElement(xmlDoc, 'DatiBollo');
  const bolloVirtuale = getTagValue(xmlDoc, ['BolloVirtuale']);
  const hasStampDuty = !!datiBollo || bolloVirtuale === 'SI' || amount > 77.47;

  // --- CAUSALE / NOTE ---
  const causale = getTagValue(xmlDoc, ['Causale']);
  const notes = causale || 'Fattura Elettronica importata da SDI XML';

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

export interface InvoiceSequenceGapReport {
  year: string;
  missingNumbers: number[];
  formattedRanges: string[]; // e.g. ["1-13", "35-39"]
  hasGaps: boolean;
}

/**
 * Identifica con precisione i buchi nella sequenza di numerazione delle fatture per l'anno specificato.
 * Genera l'elenco dei numeri mancanti e li raggruppa in intervalli formattati (es. "1-13", "35-39").
 */
export function findMissingInvoiceSequenceGaps(
  invoices: { number: string; date: string }[],
  year: string = '2026'
): InvoiceSequenceGapReport {
  const filtered = invoices.filter(inv => inv.date && inv.date.startsWith(year));
  
  const numbersPresent = new Set<number>();
  for (const inv of filtered) {
    if (!inv.number) continue;
    // Rimuovi l'anno per evitare di scambiare "2026" per il numero di fattura
    const numStrWithoutYear = inv.number.replace(new RegExp(year, 'g'), '');
    const match = numStrWithoutYear.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > 0 && num <= 5000) {
        numbersPresent.add(num);
      }
    }
  }

  // Se l'utente ha esplicitamente caricato tutte le fatture (es. da 1 a 39), o se non ci sono buchi reali, non segnalare falsi positivi
  // Controlliamo se tutti i numeri da 1 al massimo sono presenti
  if (numbersPresent.size === 0) {
    return {
      year,
      missingNumbers: [],
      formattedRanges: [],
      hasGaps: false
    };
  }

  const sortedNumbers = Array.from(numbersPresent).sort((a, b) => a - b);
  const minNum = sortedNumbers[0];
  const maxNum = sortedNumbers[sortedNumbers.length - 1];

  const missingNumbers: number[] = [];
  // Se minNum è 1, controlliamo i buchi tra 1 e maxNum. Se minNum è maggiore di 1 (es. parte da 14), non consideriamo 1..13 come buco a meno che non ci siano fatture prima o dopo
  const startCheck = minNum === 1 ? 1 : minNum;

  for (let i = startCheck; i < maxNum; i++) {
    if (!numbersPresent.has(i)) {
      missingNumbers.push(i);
    }
  }

  // Raggruppa i numeri consecutivi mancanti in intervalli leggibili
  const formattedRanges: string[] = [];
  if (missingNumbers.length > 0) {
    let rangeStart = missingNumbers[0];
    let rangeEnd = missingNumbers[0];

    for (let i = 1; i < missingNumbers.length; i++) {
      if (missingNumbers[i] === rangeEnd + 1) {
        rangeEnd = missingNumbers[i];
      } else {
        formattedRanges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
        rangeStart = missingNumbers[i];
        rangeEnd = missingNumbers[i];
      }
    }
    formattedRanges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
  }

  return {
    year,
    missingNumbers,
    formattedRanges,
    hasGaps: missingNumbers.length > 0
  };
}

