/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Clock, Calculator, AlertTriangle, Plus, CheckCircle2, ArrowRight } from 'lucide-react';
import { RavvedimentoInput, RavvedimentoResult } from '../types';

interface RavvedimentoOperosoCalculatorProps {
  selectedYear: string;
  onAddF24Entries?: (newEntries: any[]) => void;
}

export function calculateRavvedimento(input: RavvedimentoInput): RavvedimentoResult {
  const due = new Date(input.originalDueDate);
  const paid = new Date(input.actualPaymentDate);
  const diffTime = paid.getTime() - due.getTime();
  const daysLate = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  let penaltyRate = 0;
  let ravvedimentoType: RavvedimentoResult['ravvedimentoType'] = 'ordinario';

  if (daysLate <= 0) {
    penaltyRate = 0;
    ravvedimentoType = 'sprint';
  } else if (daysLate <= 14) {
    // Ravvedimento Sprint: 0.1% al giorno
    penaltyRate = 0.001 * daysLate;
    ravvedimentoType = 'sprint';
  } else if (daysLate <= 30) {
    // Ravvedimento Breve: 1.5% fisso
    penaltyRate = 0.015;
    ravvedimentoType = 'breve';
  } else if (daysLate <= 90) {
    // Ravvedimento Medio: 1.67% (1/9 di 15%)
    penaltyRate = 0.0167;
    ravvedimentoType = 'medio';
  } else if (daysLate <= 365) {
    // Ravvedimento Lungo (entro 1 anno): 3.75% (1/8 di 30%)
    penaltyRate = 0.0375;
    ravvedimentoType = 'lungo';
  } else {
    // Oltre 1 anno (entro 2 anni): 4.29% (1/7 di 30%)
    penaltyRate = 0.0429;
    ravvedimentoType = 'ordinario';
  }

  const annualInterestRate = 0.025; // Tasso d'interesse legale 2026: 2.5%
  const interestAmount = daysLate > 0 ? (input.originalAmount * annualInterestRate * daysLate) / 365 : 0;
  const penaltyAmount = input.originalAmount * penaltyRate;

  // Codici Sanzione ed Interessi per F24
  let penaltyCode = '8901'; // Default erario
  let interestCode = '1989';

  if (input.taxCode.startsWith('P') || input.taxCode.startsWith('C')) {
    penaltyCode = 'SANZ_INPS';
    interestCode = 'INT_INPS';
  } else if (input.taxCode === '1790' || input.taxCode === '1791' || input.taxCode === '1792' || input.taxCode === '4001') {
    penaltyCode = '8901';
    interestCode = '1989';
  }

  return {
    daysLate,
    penaltyCode,
    penaltyRate,
    penaltyAmount: Math.round(penaltyAmount * 100) / 100,
    interestCode,
    annualInterestRate,
    interestAmount: Math.round(interestAmount * 100) / 100,
    totalToPay: Math.round((input.originalAmount + penaltyAmount + interestAmount) * 100) / 100,
    ravvedimentoType
  };
}

export default function RavvedimentoOperosoCalculator({
  selectedYear,
  onAddF24Entries
}: RavvedimentoOperosoCalculatorProps) {
  const [taxCode, setTaxCode] = useState('1792');
  const [amount, setAmount] = useState('500.00');
  const [dueDate, setDueDate] = useState(`${selectedYear}-06-30`);
  const [paymentDate, setPaymentDate] = useState(`${selectedYear}-07-15`);
  const [addedSuccess, setAddedSuccess] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const result = calculateRavvedimento({
    taxCode,
    originalDueDate: dueDate,
    actualPaymentDate: paymentDate,
    originalAmount: numAmount,
    year: selectedYear
  });

  const handleApplyToF24 = () => {
    if (!onAddF24Entries || numAmount <= 0) return;

    const entries = [
      {
        taxCode,
        amount: numAmount,
        debtAmount: numAmount,
        creditAmount: 0,
        section: taxCode.startsWith('P') ? 'inps' : 'erario',
        date: paymentDate,
        description: `Quota Capitale F24 ${taxCode}`,
        source: 'RAVVEDIMENTO'
      },
      {
        taxCode: result.penaltyCode,
        amount: result.penaltyAmount,
        debtAmount: result.penaltyAmount,
        creditAmount: 0,
        section: 'erario',
        date: paymentDate,
        description: `Sanzione Ravvedimento (${result.daysLate} gg ritardo)`,
        source: 'RAVVEDIMENTO'
      },
      {
        taxCode: result.interestCode,
        amount: result.interestAmount,
        debtAmount: result.interestAmount,
        creditAmount: 0,
        section: 'erario',
        date: paymentDate,
        description: `Interessi Legali ${result.annualInterestRate * 100}% (${result.daysLate} gg)`,
        source: 'RAVVEDIMENTO'
      }
    ];

    onAddF24Entries(entries);
    setAddedSuccess(true);
    setTimeout(() => setAddedSuccess(false), 3000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
        <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-extrabold text-slate-900">
            Calcolatore Ravvedimento Operoso F24
          </h3>
          <p className="text-xs text-slate-500">
            Calcola le sanzioni ridotte e gli interessi legali aggiornati per versamenti in ritardo
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="font-bold text-slate-700 block mb-1">Codice Tributo</label>
          <select
            value={taxCode}
            onChange={(e) => setTaxCode(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-bold"
          >
            <option value="1792">1792 - Saldo Imposta Sostitutiva</option>
            <option value="1790">1790 - 1° Acconto Imposta Sostitutiva</option>
            <option value="1791">1791 - 2° Acconto Imposta Sostitutiva</option>
            <option value="PXX">PXX - INPS Gestione Separata</option>
            <option value="4001">4001 - IRPEF Saldo</option>
          </select>
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">Importo Originale (€)</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold text-slate-900"
          />
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">Scadenza Originale</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-slate-900"
          />
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">Data Effettiva Pagamento</label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-slate-900"
          />
        </div>
      </div>

      {/* Riquadro Risultati Calcolo Ravvedimento */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
        <div>
          <span className="text-[10px] text-slate-500 font-sans block uppercase font-bold">Ritardo Accumulato:</span>
          <span className={`text-base font-black ${result.daysLate > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {result.daysLate} giorni
          </span>
          <span className="text-[10px] text-slate-400 block font-sans capitalize">
            Tipo: Ravvedimento {result.ravvedimentoType}
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-500 font-sans block uppercase font-bold">
            Sanzione ({result.penaltyCode}):
          </span>
          <span className="text-base font-black text-slate-900">
            € {result.penaltyAmount.toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-400 block font-sans">
            Aliquota: {(result.penaltyRate * 100).toFixed(2)}%
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-500 font-sans block uppercase font-bold">
            Interessi Legali ({result.interestCode}):
          </span>
          <span className="text-base font-black text-slate-900">
            € {result.interestAmount.toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-400 block font-sans">
            Tasso 2026: {(result.annualInterestRate * 100).toFixed(1)}% p.a.
          </span>
        </div>

        <div className="bg-slate-900 text-white p-3 rounded-lg flex flex-col justify-between">
          <div>
            <span className="text-[9px] text-slate-400 uppercase font-sans font-bold">Totale da Versare:</span>
            <div className="text-lg font-black text-amber-300">
              € {result.totalToPay.toFixed(2)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleApplyToF24}
            disabled={result.daysLate <= 0}
            className="mt-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-sans font-black text-[10px] py-1.5 px-2.5 rounded transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
          >
            {addedSuccess ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-slate-950" />
                <span>Righi Aggiunti!</span>
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                <span>Registra Righi Ravvedimento</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
