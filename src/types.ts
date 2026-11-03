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
  vatOpeningDate?: string;
  calculationYear?: number;
  inpsReduction35?: boolean;
  substituteTaxAdvancesPaidForCurrentYear?: number; // Acconti imposta sostitutiva (1790, 1791) già pagati l'anno precedente per quest'anno
  inpsAdvancesPaidForCurrentYear?: number; // Acconti INPS (PXX) già pagati l'anno precedente per quest'anno
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
  isSectionI?: boolean;
  inpsMinimale2026?: number;
  rr2Col1?: number;
  rr2Col2?: number;
  contributiIVSMinimale?: number;
  redditoEccedenteMinimale?: number | null;
  contributiEccedenteMinimale?: number | null;
  inpsGestioneSeparataBase?: number;
  inpsGestioneSeparataRate?: number;
  inpsGestioneSeparataDue?: number;
  inpsGestioneSeparataAcconto1?: number;
  inpsGestioneSeparataAcconto2?: number;
  inpsGestioneSeparataAccontiTotale?: number;
  substituteTaxSaldo?: number; // Saldo imposta sostitutiva anno precedente (Cod. 1792)
  substituteTaxAcconto1?: number; // 1° Acconto 50% entro 30 Giugno (Cod. 1790)
  substituteTaxAcconto2?: number; // 2° Acconto 50% entro 30 Novembre (Cod. 1791)
  substituteTaxAccontiTotale?: number; // Totale acconti dovuti
  // Dettagli acconti già versati rinvenuti da F24 anno precedente:
  substituteTaxAdvancesDeducted?: number; // Somma di 1790 + 1791 già versati per l'anno corrente
  inpsAdvancesDeducted?: number; // Somma di acconti PXX già versati per l'anno corrente
  substituteTaxNetDue?: number; // Saldo netto imposta sostitutiva a debito dopo scomputo acconti
  inpsNetDue?: number; // Saldo netto INPS a debito dopo scomputo acconti
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
  driveFileUrl?: string;
}

export interface SecondaryAtecoCode {
  code: string;
  description: string;
  coefficient: number;
  percentageShare: number; // e.g. 30 for 30% of total revenue
}

export interface BusinessProfile {
  fullName: string;
  vatNumber: string;
  fiscalCode?: string;
  atecoCode: string;
  pensionFund: PensionFundType;
  startYear: string;
  isStartup: boolean;
  vatOpeningDate?: string;
  inpsReduction35?: boolean;
  manualContributionsByYear?: Record<string, number>;
  useAutomaticF24ByYear?: Record<string, boolean>;
  secondaryAtecoCodes?: SecondaryAtecoCode[];
}

export interface RavvedimentoInput {
  taxCode: string;
  originalDueDate: string; // YYYY-MM-DD
  actualPaymentDate: string; // YYYY-MM-DD
  originalAmount: number;
  year: string;
}

export interface RavvedimentoResult {
  daysLate: number;
  penaltyCode: string;
  penaltyRate: number; // e.g. 0.001 per day or 0.015
  penaltyAmount: number;
  interestCode: string;
  annualInterestRate: number; // e.g. 0.025 for 2.5% in 2026
  interestAmount: number;
  totalToPay: number;
  ravvedimentoType: 'sprint' | 'breve' | 'medio' | 'lungo' | 'ordinario';
}

export interface ReconciliationStatus {
  category: 'IMPOSTA_SOSTITUTIVA' | 'INPS_GESTIONE_SEPARATA' | 'INPS_ARTIGIANI_COMMERCIANTI' | 'MARCA_BOLLO';
  title: string;
  taxCode: string;
  dueAmount: number;
  paidAmount: number;
  difference: number; // dueAmount - paidAmount
  status: 'RICONCILIATO' | 'A_DEBITO_PARZIALE' | 'NON_VERSATO' | 'ECCEDENZA_CREDITO';
  details: string;
}

export interface F24Entry {
  id: string;
  date: string; // The date of payment or entry (YYYY-MM-DD)
  taxCode: string; // Codice Tributo e.g., 4001, 1792, 1790, 1791, PXX, P10, AP, CP ecc.
  amount: number; // Importo netto versato o registrato
  debtAmount?: number; // Importo a debito versato
  creditAmount?: number; // Importo a credito compensato (Compensazione)
  netAmount?: number; // Saldo netto del rigo (Debito - Credito)
  section?: string; // Sezione ministeriale (Erario, INPS, Regioni, Enti Locali)
  description?: string;
  source: string; // "Manuale" o "PDF"
  fileName?: string; // Nome del file PDF di provenienza
  driveFileId?: string;
  isAcconto?: boolean; // Se è un acconto (1790, 1791, PXX acconto)
  targetYear?: string; // Anno di competenza a cui si riferisce l'acconto (es. versato nel 2025 per il 2026)
  accontoType?: '1_acconto' | '2_acconto' | 'saldo' | 'altro';
  totalDebtF24?: number; // Totale debiti del modello F24 (Totale A)
  totalCreditF24?: number; // Totale compensazioni del modello F24 (Totale B)
  netDueF24?: number; // Netto effettivo da pagare / quietanzato del modello F24 (Saldo A - B)
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
