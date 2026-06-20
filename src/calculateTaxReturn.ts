/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TaxInput, TaxReturnCalculation } from './types';
import { findAtecoCode, findPensionFund } from './taxData';

/**
 * Motore di Calcolo Fiscale per il Regime Forfettario Italiano.
 * 
 * LOGICA DEL REGIME FORFETTARIO:
 * 1. Fatturato Lordo: Solo le fatture incassate nell'anno (Principio di Cassa).
 * 2. Reddito Imponibile Lordo: Si applica il Coefficiente di Redditività ATECO al fatturato.
 *    Esempio: Fatturato = 10.000€, ATECO 62.01.00 (67%). Reddito Imponibile Lordo = 6.700€.
 * 3. Deduzione Contributi (Principio di Cassa): Dal Reddito Imponibile Lordo si sottraggono i contributi previdenziali 
 *    effettivamente versati nell'anno d'imposta (anche se riferiti a saldo/acconto dell'anno precedente).
 *    Reddito Imponibile Netto = Reddito Imponibile Lordo - Contributi Versati. (Minimo di 0).
 * 4. Imposta Sostitutiva: 
 *    - 5% per "Nuova Attività" (start-up) per i primi 5 anni.
 *    - 15% per attività ordinaria.
 *    Imposta Sostitutiva = Reddito Imponibile Netto * Aliquota.
 * 5. Calcolo Contributi Anno Corrente:
 *    - Gestione Separata INPS: Aliquota (es. 26.07%) calcolata direttamente sul Reddito Imponibile Lordo.
 *    - Artigiani e Commercianti: Minimali fissi fino alla soglia minima (18.415€ per il 2026), e aliquota (es. 24%) sulla parte eccedente.
 *    - Casse Professionali (es. Inarcassa): Aliquota soggettiva sul reddito + contributo minimo.
 */
export function calculateTaxReturn(input: TaxInput): TaxReturnCalculation {
  const { 
    revenue, 
    atecoCode, 
    pensionFund, 
    contributionsPaidPreviousYear, 
    isStartup, 
    yearOfActivity 
  } = input;

  const ateco = findAtecoCode(atecoCode);
  const fund = findPensionFund(pensionFund);

  // 1. Reddito Imponibile Lordo (Fatturato * Coefficiente)
  const grossTaxableIncome = Math.max(0, revenue * ateco.coefficient);

  // 2. Deduzione Contributi Previdenziali dell'anno (Principio di Cassa)
  const deductibleContributions = Math.max(0, contributionsPaidPreviousYear);
  const netTaxableIncome = Math.max(0, grossTaxableIncome - deductibleContributions);

  // 3. Aliquota Imposta Sostitutiva (5% o 15%)
  // Si applica il 5% se è contrassegnato come startup ed è all'interno dei primi 5 anni di attività
  const isEligibleForStartupRate = isStartup && yearOfActivity >= 1 && yearOfActivity <= 5;
  const taxRate = isEligibleForStartupRate ? 0.05 : 0.15;

  // 4. Calcolo Imposta Sostitutiva
  const substituteTax = netTaxableIncome * taxRate;

  // 5. Calcolo Contributi Previdenziali dovuti per l'anno corrente
  let currentYearContributions = 0;
  
  const isSectionI = fund.id === 'INPS_ARTIGIANI' || fund.id === 'INPS_COMMERCIANTI';
  const MINIMALE_INPS_2025 = 18555;
  let inpsMinimale2025: number | undefined;
  let rr2Col1: number | undefined;
  let rr2Col2: number | undefined;
  let contributiIVSMinimale: number | undefined;
  let redditoEccedenteMinimale: number | null = null;
  let contributiEccedenteMinimale: number | null = null;

  if (isSectionI) {
    inpsMinimale2025 = MINIMALE_INPS_2025;
    rr2Col1 = grossTaxableIncome;
    rr2Col2 = MINIMALE_INPS_2025;
    contributiIVSMinimale = fund.minimumContribution || 4200;

    if (grossTaxableIncome <= MINIMALE_INPS_2025) {
      currentYearContributions = contributiIVSMinimale;
      redditoEccedenteMinimale = 0;
      contributiEccedenteMinimale = 0;
    } else {
      const excess = grossTaxableIncome - MINIMALE_INPS_2025;
      redditoEccedenteMinimale = excess;
      contributiEccedenteMinimale = excess * fund.rate;
      currentYearContributions = contributiIVSMinimale + contributiEccedenteMinimale;
    }
  } else if (fund.id === 'INPS_GESTIONE_SEPARATA') {
    // La gestione separata calcola il contributo sul Reddito Imponibile Lordo (senza sottrarre i contributi dell'anno scorso per il contributivo, si applica direttamente sull'imponibile)
    currentYearContributions = grossTaxableIncome * fund.rate;
  } else if (fund.hasMinimum && fund.minimumContribution !== undefined && fund.minimumThreshold !== undefined) {
    // Casse con minimale fisso (Artigiani/Commercianti fallback, if not INPS Art/Com)
    if (grossTaxableIncome <= fund.minimumThreshold) {
      // Sotto il minimale si paga la quota fissa obbligatoria
      currentYearContributions = fund.minimumContribution;
    } else {
      // Sopra il minimale si paga la quota fissa + l'aliquota sull'eccedenza
      const excess = grossTaxableIncome - fund.minimumThreshold;
      currentYearContributions = fund.minimumContribution + (excess * fund.rate);
    }
  } else {
    // Casse professionali con aliquota e minimale standard
    const subjective = grossTaxableIncome * fund.rate;
    const minimum = fund.minimumContribution || 0;
    currentYearContributions = Math.max(minimum, subjective);
  }

  // 6. Reddito Netto Rimasto in Tasca al Professionista
  // Calcolato sul fatturato lordo sottraendo l'imposta sostitutiva e i contributi calcolati per l'anno in corso
  const netIncome = Math.max(0, revenue - substituteTax - currentYearContributions);

  return {
    grossRevenue: revenue,
    coefficient: ateco.coefficient,
    grossTaxableIncome,
    deductibleContributions,
    netTaxableIncome,
    taxRate,
    substituteTax,
    currentYearContributions,
    netIncome,
    isSectionI,
    inpsMinimale2025,
    rr2Col1,
    rr2Col2,
    contributiIVSMinimale,
    redditoEccedenteMinimale,
    contributiEccedenteMinimale
  };
}
