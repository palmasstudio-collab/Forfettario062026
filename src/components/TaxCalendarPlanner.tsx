/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Calendar, Clock, AlertTriangle, ShieldCheck, Download, CheckCircle2 } from 'lucide-react';
import { TaxReturnCalculation } from '../types';

interface TaxCalendarPlannerProps {
  calculation: TaxReturnCalculation;
  selectedYear: string;
}

export default function TaxCalendarPlanner({ calculation, selectedYear }: TaxCalendarPlannerProps) {
  const currentYr = selectedYear;
  const substituteTax = calculation.substituteTaxNetDue ?? calculation.substituteTax;
  const inpsDue = calculation.inpsNetDue ?? calculation.inpsGestioneSeparataDue ?? calculation.currentYearContributions;

  // Scadenze Ufficiali Agenzia delle Entrate per Regime Forfettario
  const milestones = [
    {
      date: `16 Gennaio ${currentYr}`,
      title: 'Versamento Bollo Virtuale Fatture 4° Trimestre',
      code: '2524',
      amount: 32.00,
      type: 'bollo',
      status: 'scaduto'
    },
    {
      date: `16 Marzo ${currentYr}`,
      title: 'Termine Tassa Bollatura Libri Sociali / Certificazione Unica',
      code: 'CU',
      amount: 0.00,
      type: 'adempimento',
      status: 'scaduto'
    },
    {
      date: `30 Giugno ${currentYr}`,
      title: '1° Acconto 50% Imposta Sostitutiva + Saldo Anno Precedente + INPS 1° Acconto',
      code: '1790 / 1792 / PXX',
      amount: (substituteTax * 0.50) + (inpsDue * 0.40) + (substituteTax * 0.20),
      type: 'f24_importante',
      status: 'in_arrivo'
    },
    {
      date: `16 Luglio ${currentYr}`,
      title: 'Termine F24 con Maggiorazione 0,40% (Se non versato a Giugno)',
      code: '1790 / 1792',
      amount: ((substituteTax * 0.50) + (inpsDue * 0.40)) * 1.004,
      type: 'f24',
      status: 'in_arrivo'
    },
    {
      date: `20 Agosto ${currentYr}`,
      title: 'F24 Proroga Estiva (Se applicabile o in rateizzazione)',
      code: 'RATE',
      amount: (substituteTax * 0.20),
      type: 'f24',
      status: 'programmato'
    },
    {
      date: `30 Novembre ${currentYr}`,
      title: '2° Acconto 50% Imposta Sostitutiva + INPS 2° Acconto (Non Rateizzabile)',
      code: '1791 / PXX',
      amount: (substituteTax * 0.50) + (inpsDue * 0.40),
      type: 'f24_importante',
      status: 'programmato'
    }
  ];

  const totalRequiredLiquidity = milestones
    .filter(m => m.type === 'f24_importante' || m.type === 'f24')
    .reduce((sum, m) => sum + m.amount, 0);

  const handleExportICS = () => {
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Zucchetti ERP//Scadenzario Fiscale//IT\n";
    milestones.forEach((m, idx) => {
      icsContent += "BEGIN:VEVENT\n";
      icsContent += `UID:f24-scadenza-${idx}@zucchetti.erp\n`;
      icsContent += `SUMMARY:Scadenza Fiscale: ${m.title}\n`;
      icsContent += `DESCRIPTION:Codice Tributo ${m.code} - Importo Stimato: Euro ${m.amount.toFixed(2)}\n`;
      icsContent += "END:VEVENT\n";
    });
    icsContent += "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Scadenzario_Fiscale_${selectedYear}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-600 rounded-xl">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Scadenzario Fiscale Integrato & Pianificatore Liquidità
            </h3>
            <p className="text-xs text-slate-500">
              Scadenze ministeriali F24, invio dichiarazioni e riserva di cassa consigliata
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportICS}
          className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-amber-300" />
          <span>Esporta Calendario (.ics)</span>
        </button>
      </div>

      {/* Riquadro Riserva di Cassa Suggerita */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white rounded-xl p-4 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono text-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-400/20 text-amber-400 rounded-lg border border-amber-400/30">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-400 font-sans font-bold block">
              Riserva di Cassa Consigliata per F24 {selectedYear}:
            </span>
            <span className="text-xl font-extrabold text-amber-300">
              € {totalRequiredLiquidity.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <p className="text-[11px] text-slate-300 font-sans max-w-md leading-relaxed">
          Accantona circa il <strong>32%</strong> di ciascuna fattura incassata su un conto dedicato per coprire comodamente le scadenze F24 di Giugno e Novembre senza stress finanziario.
        </p>
      </div>

      {/* Timeline Scadenze */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {milestones.map((m, idx) => {
          const isImportant = m.type === 'f24_importante';

          return (
            <div
              key={idx}
              className={`p-4 rounded-xl border flex flex-col justify-between text-xs font-mono transition-all ${
                isImportant
                  ? 'bg-red-50/70 border-red-200 text-red-950'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-sans font-black text-slate-900 text-xs flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    {m.date}
                  </span>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    isImportant ? 'bg-red-200 text-[#8b0000]' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {m.code}
                  </span>
                </div>

                <h4 className="font-sans font-bold text-slate-900 text-xs leading-snug mb-3">
                  {m.title}
                </h4>
              </div>

              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <span className="font-sans text-[10px] text-slate-500 uppercase font-bold">Importo Stimato:</span>
                <span className="font-black text-slate-900 text-sm">
                  {m.amount > 0 ? `€ ${m.amount.toFixed(2)}` : 'Adempimento'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
