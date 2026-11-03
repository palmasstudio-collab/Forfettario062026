/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { F24Entry, ReconciliationStatus, TaxReturnCalculation } from '../types';

/**
 * Calcola la riconciliazione tra quanto dovuto in dichiarazione (Quadro LM / Quadro RR)
 * e quanto effettivamente versato via Modelli F24 per l'anno d'imposta selezionato.
 */
export function calculateF24Reconciliation(
  calculation: TaxReturnCalculation,
  f24Entries: F24Entry[],
  selectedYear: string
): ReconciliationStatus[] {
  const statuses: ReconciliationStatus[] = [];

  // 1. Imposta Sostitutiva (Codici 1792 per Saldo, 1790 per 1° Acconto, 1791 per 2° Acconto)
  const erarioDue = calculation.substituteTaxNetDue ?? calculation.substituteTax;
  const erarioPaidEntries = f24Entries.filter(
    e => (e.taxCode === '1792' || e.taxCode === '1790' || e.taxCode === '1791' || e.taxCode === '4001') &&
         (!e.targetYear || e.targetYear === selectedYear || e.date?.startsWith(selectedYear))
  );
  const erarioPaid = erarioPaidEntries.reduce((sum, e) => sum + (e.debtAmount !== undefined ? e.debtAmount : e.amount), 0);
  const erarioDiff = erarioDue - erarioPaid;

  let erarioStatus: ReconciliationStatus['status'] = 'RICONCILIATO';
  if (Math.abs(erarioDiff) <= 1) {
    erarioStatus = 'RICONCILIATO';
  } else if (erarioPaid > 0 && erarioDiff > 0) {
    erarioStatus = 'A_DEBITO_PARZIALE';
  } else if (erarioPaid === 0 && erarioDue > 0) {
    erarioStatus = 'NON_VERSATO';
  } else if (erarioPaid > erarioDue) {
    erarioStatus = 'ECCEDENZA_CREDITO';
  }

  statuses.push({
    category: 'IMPOSTA_SOSTITUTIVA',
    title: 'Imposta Sostitutiva 5%/15% (LM43 / Cod. 1792/1790/1791)',
    taxCode: '1792 / 1790 / 1791',
    dueAmount: erarioDue,
    paidAmount: erarioPaid,
    difference: erarioDiff,
    status: erarioStatus,
    details: erarioStatus === 'RICONCILIATO'
      ? 'Tutti i versamenti dell\'imposta sostitutiva risultano riconciliati e coperti.'
      : erarioStatus === 'A_DEBITO_PARZIALE'
      ? `Residuo da versare: € ${erarioDiff.toFixed(2)}. Verifica le scadenze o applica il ravvedimento.`
      : erarioStatus === 'NON_VERSATO'
      ? `Nessun versamento F24 rilevato a fronte di un debito calcolato di € ${erarioDue.toFixed(2)}.`
      : `Eccedenza di versamento/credito pari a € ${Math.abs(erarioDiff).toFixed(2)} da riportare o compensare.`
  });

  // 2. Contributi INPS Gestione Separata (Causale PXX / P10)
  const inpsDue = calculation.inpsNetDue ?? calculation.inpsGestioneSeparataDue ?? calculation.currentYearContributions;
  const inpsPaidEntries = f24Entries.filter(
    e => (e.taxCode === 'PXX' || e.taxCode === 'P10' || e.taxCode === 'C10' || e.section === 'inps') &&
         (!e.targetYear || e.targetYear === selectedYear || e.date?.startsWith(selectedYear))
  );
  const inpsPaid = inpsPaidEntries.reduce((sum, e) => sum + (e.debtAmount !== undefined ? e.debtAmount : e.amount), 0);
  const inpsDiff = inpsDue - inpsPaid;

  let inpsStatus: ReconciliationStatus['status'] = 'RICONCILIATO';
  if (Math.abs(inpsDiff) <= 1) {
    inpsStatus = 'RICONCILIATO';
  } else if (inpsPaid > 0 && inpsDiff > 0) {
    inpsStatus = 'A_DEBITO_PARZIALE';
  } else if (inpsPaid === 0 && inpsDue > 0) {
    inpsStatus = 'NON_VERSATO';
  } else if (inpsPaid > inpsDue) {
    inpsStatus = 'ECCEDENZA_CREDITO';
  }

  statuses.push({
    category: 'INPS_GESTIONE_SEPARATA',
    title: 'Contributi Previdenziali INPS (Quadro RR / Causale PXX)',
    taxCode: 'PXX / P10',
    dueAmount: inpsDue,
    paidAmount: inpsPaid,
    difference: inpsDiff,
    status: inpsStatus,
    details: inpsStatus === 'RICONCILIATO'
      ? 'I contributi INPS risultano regolarmente versati e riconciliati con il Quadro RR.'
      : inpsStatus === 'A_DEBITO_PARZIALE'
      ? `Residuo INPS da versare: € ${inpsDiff.toFixed(2)}.`
      : inpsStatus === 'NON_VERSATO'
      ? `Nessun Modello F24 INPS registrato a fronte di € ${inpsDue.toFixed(2)} dovuti.`
      : `Accreditata un'eccedenza INPS di € ${Math.abs(inpsDiff).toFixed(2)} utilizabile in compensazione.`
  });

  return statuses;
}
