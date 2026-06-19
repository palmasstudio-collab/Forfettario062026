/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AtecoCode, PensionFundConfig } from './types';

/**
 * Principali Codici ATECO usati nel regime forfettario.
 * Il coefficiente di redditività determina la porzione di fatturato che viene tassata.
 * Le spese reali NON sono deducibili; si deduce solo una quota forfettaria basata sul coefficiente.
 */

// Logica per determinare il coefficiente forfettario in base alle disposizioni
// dell'Agenzia delle Entrate per il regime forfettario (Legge 190/2014 e s.m.i.)
export function calculateCoefficientByAteco(atecoCode: string): number {
  const code = atecoCode.replace(/[^0-9.]/g, '');
  const prefix2 = parseInt(code.substring(0, 2), 10);
  const prefix3part = code.split('.').slice(0, 2).join('.');
  const prefix3 = parseFloat(prefix3part);

  if (prefix2 >= 10 && prefix2 <= 11) return 0.40; // Industrie alimentari e delle bevande
  if (prefix3 === 47.81) return 0.40;              // Commercio ambulante prodotti alimentari
  if (prefix3 === 47.82 || prefix3 === 47.89) return 0.54; // Commercio ambulante altri
  if (prefix3 === 46.1 || prefix3 === 46.10) return 0.62; // Intermediari del commercio
  if (prefix2 >= 45 && prefix2 <= 47) return 0.40; // Commercio all'ingrosso e al dettaglio (residuo)
  if ((prefix2 >= 41 && prefix2 <= 43) || prefix2 === 68) return 0.86; // Costruzioni e immobili
  if (prefix2 >= 55 && prefix2 <= 56) return 0.40; // Servizi di alloggio e ristorazione
  if ((prefix2 >= 64 && prefix2 <= 66) || (prefix2 >= 69 && prefix2 <= 75) || prefix2 === 85 || (prefix2 >= 86 && prefix2 <= 88)) return 0.78; // Professionisti, sanità, istruzione
  if ((prefix2 >= 1 && prefix2 <= 3) || (prefix2 >= 5 && prefix2 <= 9) || (prefix2 >= 12 && prefix2 <= 33) || (prefix2 >= 35 && prefix2 <= 39) || (prefix2 >= 49 && prefix2 <= 53) || (prefix2 >= 58 && prefix2 <= 63) || (prefix2 >= 77 && prefix2 <= 82) || (prefix2 >= 90 && prefix2 <= 99)) return 0.67; // Altre attività

  return 0.67; // Valore di default
}

export function determineAtecoType(code: string): string {
  const coeff = Math.round(calculateCoefficientByAteco(code) * 100);
  switch(coeff) {
    case 40: return "Commercio / Ristorazione";
    case 54: return "Commercio Ambulante";
    case 62: return "Intermediari / Agenti";
    case 86: return "Costruzioni / Immobiliari";
    case 78: return "Professionisti / Autonomi";
    case 67: default: return "Artigiani / Altre attività";
  }
}

import { ATECO_2025_REGISTRY } from './atecoDatabase';

export const DEFAULT_ATECO_CODES: AtecoCode[] = ATECO_2025_REGISTRY.map(item => ({
  code: item.code,
  description: item.description,
  coefficient: calculateCoefficientByAteco(item.code),
  category: determineAtecoType(item.code)
}));

export let ATECO_CODES: AtecoCode[] = [...DEFAULT_ATECO_CODES];

// Proactive Load from localStorage on initialization
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('custom_ateco_codes');
    if (stored) {
      const parsed: AtecoCode[] = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const existingSet = new Set(DEFAULT_ATECO_CODES.map(c => c.code));
        parsed.forEach(c => {
          if (!existingSet.has(c.code)) {
            ATECO_CODES.push({
              code: c.code,
              description: c.description,
              coefficient: calculateCoefficientByAteco(c.code),
              category: determineAtecoType(c.code)
            });
          }
        });
        ATECO_CODES.sort((a, b) => a.code.localeCompare(b.code));
      }
    }
  }
} catch (e) {
  console.error("Errore caricamento codici ATECO da localStorage:", e);
}

export async function importAtecoRegistryFromPdf(file: File): Promise<AtecoCode[]> {
  const { extractAtecoFromPdf } = await import('./utils/pdfAtecoParser');
  const parsed = await extractAtecoFromPdf(file);
  
  const generated: AtecoCode[] = [];

  parsed.forEach(item => {
    generated.push({
      code: item.code,
      description: item.description,
      coefficient: calculateCoefficientByAteco(item.code),
      category: determineAtecoType(item.code)
    });
  });

  // Load any previously saved custom codes if any
  let currentCustom: AtecoCode[] = [];
  try {
    const stored = localStorage.getItem('custom_ateco_codes');
    if (stored) {
      currentCustom = JSON.parse(stored);
    }
  } catch (error) {
    console.error(error);
  }

  // Merge the new generated codes with the existing custom ones
  const customMap = new Map<string, AtecoCode>();
  currentCustom.forEach(c => customMap.set(c.code, c));
  generated.forEach(c => customMap.set(c.code, c));
  const newCustomList = Array.from(customMap.values());

  try {
    localStorage.setItem('custom_ateco_codes', JSON.stringify(newCustomList));
  } catch (e) {
    console.error(e);
  }

  // Reload the global ATECO_CODES list under the same reference
  const globalMergedMap = new Map<string, AtecoCode>();
  DEFAULT_ATECO_CODES.forEach(c => globalMergedMap.set(c.code, c));
  newCustomList.forEach(c => globalMergedMap.set(c.code, c));

  const finalCodes = Array.from(globalMergedMap.values()).sort((a, b) => a.code.localeCompare(b.code));

  ATECO_CODES.length = 0;
  ATECO_CODES.push(...finalCodes);

  return finalCodes;
}

/**
 * Regole delle Casse Previdenziali per l'anno 2026.
 * Ogni cassa ha aliquote e minimali diversi.
 */
export const PENSION_FUNDS: PensionFundConfig[] = [
  {
    id: 'INPS_GESTIONE_SEPARATA',
    name: 'INPS Gestione Separata (Liberi Professionisti)',
    rate: 0.2607, // Aliquota del 26.07% per i non iscritti ad altre forme contributive obbligatorie
    hasMinimum: false,
    description: 'Per professionisti "senza cassa" specifica (sviluppatori, copywriter, consulenti). I contributi si pagano rigorosamente in percentuale sul reddito imponibile lordo, senza alcun minimale fisso.'
  },
  {
    id: 'INPS_ARTIGIANI',
    name: 'INPS Artigiani',
    rate: 0.24, // Aliquota base circa 24%
    hasMinimum: true,
    minimumContribution: 4200, // Minimali fissi circa 4.200 € all'anno (coprono redditi fino a circa 18.000 €)
    minimumThreshold: 18415,
    description: 'Per imprese artigiane. Prevede un minimale annuo obbligatorio di circa 4.200 € indipendente dal fatturato, garantendo la copertura contributiva di base.'
  },
  {
    id: 'INPS_COMMERCIANTI',
    name: 'INPS Commercianti',
    rate: 0.2448, // Aliquota base circa 24.48% o ridotta nel forfettario
    hasMinimum: true,
    minimumContribution: 4290, // Fissi circa 4.290 €
    minimumThreshold: 18415,
    description: 'Per e-commerce e commerciati al dettaglio. Include minimale fisso. Nota: per i commercianti nel forfettario è possibile richiedere online all’INPS la riduzione del 35% dei contributi (fissi e variabili).'
  },
  {
    id: 'INARCASSA',
    name: 'Inarcassa (Ingegneri e Architetti)',
    rate: 0.145, // Soggettivo 14.5% + integrativo 4%
    hasMinimum: true,
    minimumContribution: 2475,
    description: 'Cassa Nazionale di Previdenza ed Assistenza per gli Ingegneri ed Architetti Liberi Professionisti. Aliquota soggettiva 14.5% con minimale.'
  },
  {
    id: 'ENPAP',
    name: 'ENPAP (Psicologi)',
    rate: 0.15, // Soggettivo 15% + integrativo 2%
    hasMinimum: true,
    minimumContribution: 780,
    description: 'Ente Nazionale di Previdenza ed Assistenza per gli Psicologi. Aliquota soggettiva base del 15% del reddito netto con minimale ridotto per giovani.'
  },
  {
    id: 'ENPAM',
    name: 'ENPAM (Medici e Odontoiatri Quota B)',
    rate: 0.195, // Aliquota Quota B circa 19.5%
    hasMinimum: false,
    description: 'Ente Nazionale di Previdenza ed Assistenza Medici ed Odontoiatri. Aliquota proporzionale per l’attività libero professionale.'
  },
  {
    id: 'CASSA_FORENSE',
    name: 'Cassa Forense (Avvocati)',
    rate: 0.15, // Aliquota soggettiva 15%
    hasMinimum: true,
    minimumContribution: 3100,
    description: 'Cassa di Previdenza degli Avvocati. Prevede un contributo soggettivo del 15% ed un minimale annuale obbligatorio.'
  }
];

/**
 * Trova il codice ATECO dalla lista, restituisce un default se non trovato
 */
export function findAtecoCode(codeStr: string): AtecoCode {
  return ATECO_CODES.find(a => a.code === codeStr) || {
    code: codeStr,
    description: 'Altra attività sottomessa a coefficiente standard',
    coefficient: 0.78,
    category: 'Altre Attività'
  };
}

/**
 * Ottiene la configurazione previdenziale
 */
export function findPensionFund(fundId: string): PensionFundConfig {
  return PENSION_FUNDS.find(p => p.id === fundId) || PENSION_FUNDS[0];
}
