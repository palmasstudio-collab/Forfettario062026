/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  FileText, 
  X, 
  CheckCircle2, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles, 
  CreditCard,
  Calendar,
  User,
  Info,
  Layers,
  Check
} from 'lucide-react';
import { ParsedF24Document, ParsedF24Entry } from '../utils/pdfF24Parser';

interface F24DocumentBreakdownModalProps {
  document: ParsedF24Document;
  onClose: () => void;
  onConfirm?: () => void;
}

export default function F24DocumentBreakdownModal({
  document,
  onClose,
  onConfirm
}: F24DocumentBreakdownModalProps) {
  const hasCompensations = document.totalCredit > 0 || document.entries.some(e => e.creditAmount > 0);
  const isSaldoZero = document.netDue === 0 && (document.totalDebt > 0 || document.totalCredit > 0);
  const accontiEntries = document.entries.filter(e => 
    e.taxCode === '1790' || 
    e.taxCode === '1791' || 
    (e.taxCode === 'PXX' && (e.deadlineType === 'acconto1' || e.deadlineType === 'acconto2' || e.description?.toLowerCase().includes('acconto') || e.debtAmount <= 100))
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Zucchetti ERP Style */}
        <div className="bg-gradient-to-r from-[#7a0c10] via-[#8b0000] to-[#5a080b] text-white p-4 sm:p-5 flex items-center justify-between border-b border-red-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
              <FileText className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-red-900/80 px-2 py-0.5 rounded text-red-200 font-mono">
                  Esito Lettura Quietanza F24
                </span>
                {isSaldoZero ? (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded shadow-xs">
                    F24 a Saldo Zero
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-900 px-2 py-0.5 rounded shadow-xs font-mono">
                    Netto: € {document.netDue.toFixed(2)}
                  </span>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight mt-0.5">
                Riepilogo Tributi, Compensazioni e Netto da Pagare
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            title="Chiudi visualizzatore"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informazioni Quietanza & Documento */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">File Analizzato</span>
              <span className="font-mono font-bold text-slate-800 truncate block" title={document.fileName}>
                {document.fileName}
              </span>
            </div>
          </div>

          {document.taxpayerFiscalCode && (
            <div className="flex items-center gap-2 text-slate-600">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Contribuente Rilevato</span>
                <span className="font-mono font-bold text-slate-800">
                  {document.taxpayerFiscalCode}
                </span>
              </div>
            </div>
          )}

          {document.paymentDate && (
            <div className="flex items-center gap-2 text-slate-600">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Data Pagamento / Quietanza</span>
                <span className="font-mono font-bold text-emerald-700">
                  {document.paymentDate}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Body / Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          
          {/* Card Principale Totali: Debito, Compensazioni e Saldo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Totale Debito */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Totale Debiti (A)
              </span>
              <div className="text-xl sm:text-2xl font-mono font-black text-slate-800 mt-1">
                € {document.totalDebt.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Somma di tutti gli importi a debito versati</p>
            </div>

            {/* Totale Compensazioni */}
            <div className={`rounded-2xl p-4 border ${
              document.totalCredit > 0 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider block">
                  Compensazioni / Crediti (B)
                </span>
                {document.totalCredit > 0 && (
                  <span className="text-[9px] bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded font-bold">
                    Applicate
                  </span>
                )}
              </div>
              <div className={`text-xl sm:text-2xl font-mono font-black mt-1 ${
                document.totalCredit > 0 ? 'text-emerald-700' : 'text-slate-400'
              }`}>
                - € {document.totalCredit.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] opacity-80 mt-1">Crediti d'imposta usati in compensazione F24</p>
            </div>

            {/* Netto Effettivo da Pagare (Saldo A - B) */}
            <div className={`rounded-2xl p-4 border shadow-xs ${
              isSaldoZero
                ? 'bg-emerald-600 text-white border-emerald-700'
                : 'bg-slate-900 text-white border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">
                  Netto da Pagare · Saldo (A - B)
                </span>
                {isSaldoZero ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                ) : (
                  <CreditCard className="w-4 h-4 text-amber-300" />
                )}
              </div>
              <div className="text-xl sm:text-2xl font-mono font-black mt-1 text-white">
                € {document.netDue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-300 mt-1">
                {isSaldoZero 
                  ? 'Nessun addebito bancario (Interamente compensato)' 
                  : 'Importo effettivo addebitato sul conto corrente'}
              </p>
            </div>
          </div>

          {/* Tabella Dettaglio Analitico dei Singoli Righi Tributo */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
            <div className="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Dettaglio Righi Modello F24 ({document.entries.length} tributi)
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                Riconoscimento automatico AI &amp; coordinate PDF
              </span>
            </div>

            {document.entries.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nessun codice tributo rilevato nel documento.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Sezione</th>
                      <th className="py-2.5 px-3">Codice Tributo</th>
                      <th className="py-2.5 px-3">Anno / Rif.</th>
                      <th className="py-2.5 px-3">Descrizione Fiscale</th>
                      <th className="py-2.5 px-3 text-right">Debito (€)</th>
                      <th className="py-2.5 px-3 text-right">Compensazione (€)</th>
                      <th className="py-2.5 px-3 text-right">Netto Rigo (€)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {document.entries.map((entry, idx) => {
                      const isAcconto = entry.taxCode === '1790' || 
                        entry.taxCode === '1791' || 
                        (entry.taxCode === 'PXX' && (entry.deadlineType === 'acconto1' || entry.deadlineType === 'acconto2' || entry.description?.toLowerCase().includes('acconto') || entry.debtAmount <= 100));
                      const entryYear = entry.year || new Date().getFullYear().toString();
                      const targetYear = isAcconto ? String(parseInt(entryYear, 10) + 1) : entryYear;
                      const hasRowCredit = entry.creditAmount > 0;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 font-sans">
                            <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                              entry.section === 'inps' 
                                ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                                : entry.section === 'erario'
                                ? 'bg-red-50 text-[#8b0000] border border-red-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {entry.section || 'ERARIO'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-xs border border-slate-200">
                              {entry.taxCode}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {entryYear}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-700 max-w-xs">
                            <div className="font-medium text-xs text-slate-900">{entry.description || `Tributo ${entry.taxCode}`}</div>
                            {isAcconto && (
                              <div className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 mt-0.5">
                                <Sparkles className="w-3 h-3 text-emerald-600" />
                                <span>Acconto: confluirà nel calcolo del {targetYear}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            € {entry.debtAmount.toFixed(2)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold ${
                            hasRowCredit ? 'text-emerald-700 bg-emerald-50/50' : 'text-slate-400'
                          }`}>
                            {hasRowCredit ? `- € ${entry.creditAmount.toFixed(2)}` : '€ 0,00'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                            € {(entry.debtAmount - entry.creditAmount).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold text-xs border-t-2 border-slate-200 font-mono">
                    <tr>
                      <td colSpan={4} className="py-2.5 px-3 font-sans uppercase text-[10px] text-slate-500">
                        Totali Documento F24:
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-900">
                        € {document.totalDebt.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-700">
                        - € {document.totalCredit.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-700 font-black text-sm">
                        € {document.netDue.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Note Fiscali e Acconti */}
          {accontiEntries.length > 0 && (
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-emerald-950">
                <span className="font-extrabold text-emerald-900 uppercase tracking-wider block">
                  Riconoscimento Automatico Acconti Versati ({accontiEntries.length} acconti)
                </span>
                <p className="leading-relaxed">
                  I codici acconto rilevati (es. <strong>1790</strong>, <strong>1791</strong>, o <strong>PXX 40%/60%</strong>)
                  saranno memorizzati nello storico di bilancio e <strong>verranno scomputati automaticamente dal saldo a debito nel Quadro LM e nel Quadro RR dell'anno d'imposta successivo</strong>.
                </p>
              </div>
            </div>
          )}

          {hasCompensations && (
            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-blue-950">
                <span className="font-extrabold text-blue-900 uppercase tracking-wider block">
                  Regime delle Compensazioni Orizzontali / Verticali
                </span>
                <p className="leading-relaxed">
                  Questo F24 contiene un credito compensato di <strong>€ {document.totalCredit.toFixed(2)}</strong>. Il debito lordo è stato ridotto a <strong>€ {document.netDue.toFixed(2)}</strong> effettivi da corrispondere all'Erario o all'INPS.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Chiudi
          </button>

          <button
            type="button"
            onClick={() => {
              if (onConfirm) onConfirm();
              onClose();
            }}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Conferma &amp; Registra nel Bilancio</span>
          </button>
        </div>

      </div>
    </div>
  );
}
