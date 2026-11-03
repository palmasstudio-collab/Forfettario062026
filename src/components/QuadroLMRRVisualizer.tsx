/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BookOpen, ShieldCheck, Download, Copy, Check } from 'lucide-react';
import { TaxReturnCalculation, BusinessProfile } from '../types';

interface QuadroLMRRVisualizerProps {
  calculation: TaxReturnCalculation;
  profile: BusinessProfile;
  selectedYear: string;
  atecoDescription?: string;
}

export default function QuadroLMRRVisualizer({
  calculation,
  profile,
  selectedYear,
  atecoDescription
}: QuadroLMRRVisualizerProps) {
  const [copiedBox, setCopiedBox] = React.useState<string | null>(null);

  const handleCopy = (boxId: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedBox(boxId);
    setTimeout(() => setCopiedBox(null), 2000);
  };

  const netTaxDue = calculation.substituteTaxNetDue ?? calculation.substituteTax;
  const inpsNetDue = calculation.inpsNetDue ?? calculation.inpsGestioneSeparataDue ?? calculation.currentYearContributions;

  return (
    <div className="flex flex-col gap-6 animate-fade-in" id="quadro-lm-rr-facsimile">
      
      {/* Quadro LM Facsimile Ministeriale */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden font-mono">
        <div className="bg-[#8b0000] text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-red-200" />
            <h3 className="font-extrabold text-sm sm:text-base tracking-wide font-sans">
              MODELLO REDDITI PF · QUADRO LM (Regime Forfettario art. 1 c. 54-89 L. 190/2014)
            </h3>
          </div>
          <span className="text-xs bg-red-950 text-red-200 font-bold px-2.5 py-1 rounded">
            Anno D'Imposta {selectedYear}
          </span>
        </div>

        {/* Dati Generali Contribuente */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 text-xs grid grid-cols-1 sm:grid-cols-3 gap-3 font-sans">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Contribuente:</span>
            <span className="font-extrabold text-slate-900">{profile.fullName}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Codice ATECO:</span>
            <span className="font-bold text-slate-800">{profile.atecoCode} - {atecoDescription || 'Attività professionale'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Coefficiente Redditività:</span>
            <span className="font-extrabold text-emerald-700">{(calculation.coefficient * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Tabella Righi Quadro LM */}
        <div className="divide-y divide-slate-200 text-xs">
          {/* LM22 Ricavi / Compensi */}
          <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="bg-slate-200 text-slate-800 font-black px-2 py-1 rounded text-[11px] w-14 text-center">
                LM22
              </span>
              <div>
                <span className="font-sans font-bold text-slate-900 block">Ricavi o Compensi percepiti</span>
                <span className="font-sans text-[10px] text-slate-500">Principio di cassa per l'esercizio {selectedYear}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-900 text-sm">€ {calculation.grossRevenue.toFixed(2)}</span>
              <button 
                onClick={() => handleCopy('LM22', calculation.grossRevenue.toFixed(2))}
                className="p-1 text-slate-400 hover:text-slate-700"
                title="Copia valore"
              >
                {copiedBox === 'LM22' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* LM34 Reddito Lordo */}
          <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="bg-slate-200 text-slate-800 font-black px-2 py-1 rounded text-[11px] w-14 text-center">
                LM34
              </span>
              <div>
                <span className="font-sans font-bold text-slate-900 block">Reddito Lordo Imponibile</span>
                <span className="font-sans text-[10px] text-slate-500">LM22 x Coefficiente ({(calculation.coefficient * 100).toFixed(0)}%)</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-900 text-sm">€ {calculation.grossTaxableIncome.toFixed(2)}</span>
              <button 
                onClick={() => handleCopy('LM34', calculation.grossTaxableIncome.toFixed(2))}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                {copiedBox === 'LM34' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* LM35 Contributi Previdenziali Dedotti */}
          <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors bg-emerald-50/40">
            <div className="flex items-center gap-3">
              <span className="bg-emerald-200 text-emerald-900 font-black px-2 py-1 rounded text-[11px] w-14 text-center">
                LM35
              </span>
              <div>
                <span className="font-sans font-bold text-emerald-950 block">Contributi Previdenziali Versati Dedotti</span>
                <span className="font-sans text-[10px] text-emerald-800">Versamenti INPS effettivamente sostenuti nell'anno</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-emerald-800 text-sm">- € {calculation.deductibleContributions.toFixed(2)}</span>
              <button 
                onClick={() => handleCopy('LM35', calculation.deductibleContributions.toFixed(2))}
                className="p-1 text-emerald-600 hover:text-emerald-900"
              >
                {copiedBox === 'LM35' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* LM38 Reddito Netto Imponibile */}
          <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="bg-slate-200 text-slate-800 font-black px-2 py-1 rounded text-[11px] w-14 text-center">
                LM38
              </span>
              <div>
                <span className="font-sans font-bold text-slate-900 block">Reddito Netto Imponibile</span>
                <span className="font-sans text-[10px] text-slate-500">LM34 - LM35</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-900 text-sm">€ {calculation.netTaxableIncome.toFixed(2)}</span>
              <button 
                onClick={() => handleCopy('LM38', calculation.netTaxableIncome.toFixed(2))}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                {copiedBox === 'LM38' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* LM40 Imposta Sostitutiva Dovuta */}
          <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors bg-rose-50/40">
            <div className="flex items-center gap-3">
              <span className="bg-rose-200 text-rose-900 font-black px-2 py-1 rounded text-[11px] w-14 text-center">
                LM40
              </span>
              <div>
                <span className="font-sans font-bold text-rose-950 block">Imposta Sostitutiva Dovuta ({(calculation.taxRate * 100).toFixed(0)}%)</span>
                <span className="font-sans text-[10px] text-rose-800">
                  {calculation.taxRate === 0.05 ? 'Aliquota Startup 5% Agevolata' : 'Aliquota Ordinaria 15%'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-rose-800 text-sm">€ {calculation.substituteTax.toFixed(2)}</span>
              <button 
                onClick={() => handleCopy('LM40', calculation.substituteTax.toFixed(2))}
                className="p-1 text-rose-600 hover:text-rose-900"
              >
                {copiedBox === 'LM40' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* LM42 Acconti Versati */}
          <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="bg-slate-200 text-slate-800 font-black px-2 py-1 rounded text-[11px] w-14 text-center">
                LM42
              </span>
              <div>
                <span className="font-sans font-bold text-slate-900 block">Acconti Imposta Sostitutiva Versati</span>
                <span className="font-sans text-[10px] text-slate-500">Scomputo F24 1790 + 1791 precedentemente corrisposti</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-emerald-700 text-sm">- € {(calculation.substituteTaxAdvancesDeducted || 0).toFixed(2)}</span>
              <button 
                onClick={() => handleCopy('LM42', (calculation.substituteTaxAdvancesDeducted || 0).toFixed(2))}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                {copiedBox === 'LM42' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* LM43 Imposta Sostitutiva a Debito / Credito */}
          <div className="p-4 flex items-center justify-between bg-slate-900 text-white">
            <div className="flex items-center gap-3">
              <span className="bg-amber-400 text-slate-950 font-black px-2 py-1 rounded text-[11px] w-14 text-center font-sans">
                LM43
              </span>
              <div>
                <span className="font-sans font-black text-white text-sm block">Imposta Sostitutiva Netta a Debito</span>
                <span className="font-sans text-[10px] text-slate-400">Codice Tributo F24: 1792 (Saldo esercizio {selectedYear})</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-amber-300 text-base">€ {netTaxDue.toFixed(2)}</span>
              <button 
                onClick={() => handleCopy('LM43', netTaxDue.toFixed(2))}
                className="p-1 text-slate-400 hover:text-white"
              >
                {copiedBox === 'LM43' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quadro RR Facsimile Ministeriale (INPS Gestione Separata) */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden font-mono">
        <div className="bg-blue-900 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-200" />
            <h3 className="font-extrabold text-sm sm:text-base tracking-wide font-sans">
              MODELLO REDDITI PF · QUADRO RR SEZIONE II (Contributi Previdenziali INPS)
            </h3>
          </div>
          <span className="text-xs bg-blue-950 text-blue-200 font-bold px-2.5 py-1 rounded">
            Causale PXX / P10
          </span>
        </div>

        <div className="divide-y divide-slate-200 text-xs">
          <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="bg-blue-100 text-blue-900 font-black px-2 py-1 rounded text-[11px] w-14 text-center">
                RR2 Col 1
              </span>
              <div>
                <span className="font-sans font-bold text-slate-900 block">Base Imponibile INPS</span>
                <span className="font-sans text-[10px] text-slate-500">Corrisponde al Reddito Lordo LM34 (€ {calculation.grossTaxableIncome.toFixed(2)})</span>
              </div>
            </div>
            <span className="font-black text-slate-900 text-sm">€ {calculation.grossTaxableIncome.toFixed(2)}</span>
          </div>

          <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="bg-blue-100 text-blue-900 font-black px-2 py-1 rounded text-[11px] w-14 text-center">
                RR2 Col 2
              </span>
              <div>
                <span className="font-sans font-bold text-slate-900 block">Aliquota Previdenziale Applicata</span>
                <span className="font-sans text-[10px] text-slate-500">Gestione Separata Liberi Professionisti senza altra cassa</span>
              </div>
            </div>
            <span className="font-black text-blue-800 text-sm">26,07%</span>
          </div>

          <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="bg-blue-100 text-blue-900 font-black px-2 py-1 rounded text-[11px] w-14 text-center">
                RR2 Col 3
              </span>
              <div>
                <span className="font-sans font-bold text-slate-900 block">Contributo Dovuto per l'Anno</span>
                <span className="font-sans text-[10px] text-slate-500">Base Imponibile x 26,07%</span>
              </div>
            </div>
            <span className="font-black text-slate-900 text-sm">€ {(calculation.inpsGestioneSeparataDue ?? calculation.currentYearContributions).toFixed(2)}</span>
          </div>

          <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="bg-blue-100 text-blue-900 font-black px-2 py-1 rounded text-[11px] w-14 text-center">
                RR2 Col 5
              </span>
              <div>
                <span className="font-sans font-bold text-slate-900 block">Acconti INPS PXX Versati</span>
                <span className="font-sans text-[10px] text-slate-500">Scomputo acconti F24 corrisposti l'anno precedente</span>
              </div>
            </div>
            <span className="font-black text-emerald-700 text-sm">- € {(calculation.inpsAdvancesDeducted || 0).toFixed(2)}</span>
          </div>

          <div className="p-4 flex items-center justify-between bg-blue-950 text-white">
            <div className="flex items-center gap-3">
              <span className="bg-blue-400 text-slate-950 font-black px-2 py-1 rounded text-[11px] w-14 text-center font-sans">
                RR2 Col 6
              </span>
              <div>
                <span className="font-sans font-black text-white text-sm block">Saldo Netto INPS a Debito</span>
                <span className="font-sans text-[10px] text-blue-300">Causale F24: PXX (Saldo esercizio {selectedYear})</span>
              </div>
            </div>
            <span className="font-black text-blue-300 text-base">€ {inpsNetDue.toFixed(2)}</span>
          </div>
        </div>
      </div>

    </div>
  );
}
