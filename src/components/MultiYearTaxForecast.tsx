/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrendingUp, Calendar, DollarSign, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';
import { TaxInput, BusinessProfile, TaxReturnCalculation } from '../types';
import { calculateTaxReturn } from '../calculateTaxReturn';

interface MultiYearTaxForecastProps {
  profile: BusinessProfile;
  currentYearRevenue: number;
  selectedYear: string;
}

export default function MultiYearTaxForecast({
  profile,
  currentYearRevenue,
  selectedYear
}: MultiYearTaxForecastProps) {
  const years = ['2024', '2025', '2026', '2027'];
  const currentYearNum = parseInt(selectedYear, 10);

  // Calcola le proiezioni per ciascun anno
  const yearData = years.map((yrStr) => {
    const yrNum = parseInt(yrStr, 10);
    // Stima di fatturato se anno futuro
    let estRevenue = currentYearRevenue;
    if (yrNum > currentYearNum) {
      estRevenue = currentYearRevenue * 1.10; // Ipotizza crescita 10%
    } else if (yrNum < currentYearNum) {
      estRevenue = currentYearRevenue * 0.90;
    }

    // Calcolo anni di attività rispetto alla data di apertura
    let actYear = 1;
    if (profile.vatOpeningDate) {
      const openYr = parseInt(profile.vatOpeningDate.split('-')[0] || profile.vatOpeningDate.split('/')[2] || '2024', 10);
      actYear = Math.max(1, yrNum - openYr + 1);
    }

    const isStartupEligible = profile.isStartup && actYear <= 5;

    const input: TaxInput = {
      revenue: estRevenue,
      atecoCode: profile.atecoCode,
      pensionFund: profile.pensionFund,
      contributionsPaidPreviousYear: estRevenue * 0.15,
      isStartup: isStartupEligible,
      yearOfActivity: actYear,
      calculationYear: yrNum
    };

    const calc = calculateTaxReturn(input);

    return {
      year: yrStr,
      revenue: estRevenue,
      activityYear: actYear,
      taxRate: calc.taxRate,
      substituteTax: calc.substituteTax,
      inpsDue: calc.inpsGestioneSeparataDue ?? calc.currentYearContributions,
      acconto1790: calc.substituteTax * 0.50,
      acconto1791: calc.substituteTax * 0.50,
      accontoInps: (calc.inpsGestioneSeparataDue ?? calc.currentYearContributions) * 0.80,
      netIncome: calc.netIncome
    };
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#8b0000]/10 text-[#8b0000] rounded-xl">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Proiezione Pluriennale e Pianificazione Acconti (2024 - 2027)
            </h3>
            <p className="text-xs text-slate-500">
              Confronto della pressione fiscale, passaggio da aliquota 5% a 15% e impatto sulla liquidità
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
          Modello Zucchetti ERP
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {yearData.map((d) => {
          const isSelected = d.year === selectedYear;

          return (
            <div
              key={d.year}
              className={`rounded-2xl p-4 border flex flex-col justify-between transition-all ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-800 shadow-md ring-2 ring-[#8b0000]'
                  : 'bg-slate-50/80 text-slate-900 border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-black font-mono ${isSelected ? 'text-amber-300' : 'text-[#8b0000]'}`}>
                    ESERCIZIO {d.year}
                  </span>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    d.taxRate === 0.05
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    {(d.taxRate * 100).toFixed(0)}% {d.taxRate === 0.05 ? 'Startup' : 'Ordinario'}
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono mt-3">
                  <div className="flex justify-between">
                    <span className={isSelected ? 'text-slate-400 font-sans' : 'text-slate-500 font-sans'}>Fatturato:</span>
                    <span className="font-bold">€ {d.revenue.toFixed(0)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className={isSelected ? 'text-slate-400 font-sans' : 'text-slate-500 font-sans'}>Imp. Sostitutiva:</span>
                    <span className={`font-bold ${isSelected ? 'text-rose-300' : 'text-rose-600'}`}>
                      € {d.substituteTax.toFixed(0)}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className={isSelected ? 'text-slate-400 font-sans' : 'text-slate-500 font-sans'}>INPS Dovuta:</span>
                    <span className={`font-bold ${isSelected ? 'text-blue-300' : 'text-blue-600'}`}>
                      € {d.inpsDue.toFixed(0)}
                    </span>
                  </div>

                  <div className="border-t border-slate-200/40 my-2 pt-2 space-y-1 text-[11px]">
                    <span className={`text-[9px] uppercase font-bold font-sans block ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                      Acconti F24 Dovuti:
                    </span>
                    <div className="flex justify-between">
                      <span className="font-sans text-[10px]">1° Acc (Giugno 50%):</span>
                      <span className="font-bold text-amber-500">€ {d.acconto1790.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-[10px]">2° Acc (Nov 50%):</span>
                      <span className="font-bold text-amber-500">€ {d.acconto1791.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`mt-4 pt-3 border-t font-mono flex items-center justify-between text-xs ${
                isSelected ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <span className={`font-sans text-[10px] uppercase font-bold ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                  Netto Stimato:
                </span>
                <span className="font-black text-emerald-400 text-sm">
                  € {d.netIncome.toFixed(0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
