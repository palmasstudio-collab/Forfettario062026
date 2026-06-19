/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AtecoCode {
  code: string;
  description: string;
  coefficient: number; // e.g., 0.67 for 67%
  category: string;
}

export type PensionFundType = 
  | 'INPS_GESTIONE_SEPARATA' 
  | 'INPS_ARTIGIANI' 
  | 'INPS_COMMERCIANTI' 
  | 'INARCASSA' // Engineers and Architects (dynamic representation)
  | 'ENPAP' // Psychologists
  | 'ENPAM' // Doctors
  | 'CASSA_FORENSE'; // Lawyers

export interface PensionFundConfig {
  id: PensionFundType;
  name: string;
  rate: number; // percentage rate, e.g. 0.2607 (26.07%)
  hasMinimum: boolean;
  minimumContribution?: number; // annual minimum contribution if any
  minimumThreshold?: number; // threshold under which the minimum applies (e.g. for INPS Artigiani/Commercianti)
  description: string;
}

export interface TaxInput {
  revenue: number;
  atecoCode: string;
  pensionFund: PensionFundType;
  contributionsPaidPreviousYear: number;
  isStartup: boolean; // if true, 5% substitute tax instead of 15% for the first 5 years
  yearOfActivity: number; // 1-indexed (1 to 5 = startup rate eligible)
}

export interface TaxReturnCalculation {
  grossRevenue: number;
  coefficient: number;
  grossTaxableIncome: number; // Reddito Imponibile Lordo (Gross Revenue * Coefficient)
  deductibleContributions: number; // Contributi previdenziali deducibili dell'anno precedente
  netTaxableIncome: number; // Reddito Imponibile Netto (Gross - Deductible)
  taxRate: number; // 0.05 or 0.15
  substituteTax: number; // Imposta Sostitutiva (Net Taxable * taxRate)
  currentYearContributions: number; // Contributi dovuti per l'anno corrente
  netIncome: number; // Net income after Taxes and Current Year contributions
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  clientName: string;
  clientVat: string;
  amount: number;
  isPaid: boolean; // Principio di cassa applies - only paid invoices count as revenue!
  hasStampDuty: boolean; // 2€ stamp duty (Marca da bollo) if amount > 77.47€
  notes?: string;
  driveFileId?: string;
}

export interface BusinessProfile {
  fullName: string;
  vatNumber: string;
  fiscalCode?: string;
  atecoCode: string;
  pensionFund: PensionFundType;
  startYear: string;
  isStartup: boolean;
}

export interface F24Entry {
  id: string;
  date: string; // The date of payment or entry
  taxCode: string; // Codice Tributo e.g., 4001, 1792, AP, CP ecc.
  amount: number; // Importo versato
  description?: string;
  source: string; // "Manuale" o "PDF"
}

export interface AccountingPosition {
  id: string;
  name: string; // nickname of the position e.g. "Consulenza Tech", "Sviluppatore Web Rossi"
  profile: BusinessProfile;
  invoices: Invoice[];
  f24Entries?: F24Entry[];
  driveFolderId?: string;
  driveFolderUrl?: string;
  f24Files?: { name: string; id: string; url: string; dateAdded: string }[];
  fattureEmesseFolderId?: string;
  f24FolderId?: string;
  fileGenericiFolderId?: string;
}
