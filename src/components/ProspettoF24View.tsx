/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Upload, 
  Sparkles, 
  Layers, 
  CheckCircle2, 
  CreditCard, 
  Trash2, 
  Eye, 
  Download, 
  ArrowUpDown, 
  Filter, 
  Calendar, 
  Info,
  Loader2,
  AlertCircle,
  Plus
} from 'lucide-react';
import { BusinessProfile, F24Entry } from '../types';
import { ParsedF24Document, ParsedF24Entry } from '../utils/pdfF24Parser';

interface ProspettoF24ViewProps {
  profile: BusinessProfile;
  selectedYear: string;
  f24Entries: F24Entry[];
  f24Files?: { name: string; id: string; url: string; dateAdded: string }[];
  inspectedF24Doc?: ParsedF24Document | null;
  onUploadF24Pdf?: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  isProcessingF24?: boolean;
  onDeleteF24Entry?: (id: string) => void;
  onInspectDoc?: (doc: ParsedF24Document) => void;
  f24InputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function ProspettoF24View({
  profile,
  selectedYear,
  f24Entries,
  f24Files = [],
  inspectedF24Doc,
  onUploadF24Pdf,
  isProcessingF24 = false,
  onDeleteF24Entry,
  onInspectDoc,
  f24InputRef
}: ProspettoF24ViewProps) {
  // Sorting state: 'taxCode' | 'debtAmount' | 'creditAmount' | 'netAmount' | 'section'
  const [sortBy, setSortBy] = useState<'taxCode' | 'debtAmount' | 'creditAmount' | 'netAmount' | 'section'>('taxCode');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterType, setFilterType] = useState<'all' | 'with_credits' | 'acconti' | 'saldi'>('all');

  // Compute aggregated totals for the current year
  const totals = useMemo(() => {
    let totalDebt = 0;
    let totalCredit = 0;
    let totalNet = 0;

    f24Entries.forEach(entry => {
      const debt = entry.debtAmount !== undefined ? entry.debtAmount : entry.amount;
      const credit = entry.creditAmount || 0;
      const net = entry.netAmount !== undefined ? entry.netAmount : (debt - credit);

      totalDebt += debt;
      totalCredit += credit;
      totalNet += net;
    });

    return {
      totalDebt,
      totalCredit,
      totalNet
    };
  }, [f24Entries]);

  // Filter and sort entries
  const processedEntries = useMemo(() => {
    let filtered = [...f24Entries];

    if (filterType === 'with_credits') {
      filtered = filtered.filter(e => (e.creditAmount || 0) > 0);
    } else if (filterType === 'acconti') {
      filtered = filtered.filter(e => e.isAcconto);
    } else if (filterType === 'saldi') {
      filtered = filtered.filter(e => !e.isAcconto);
    }

    filtered.sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];

      if (sortBy === 'debtAmount') {
        valA = a.debtAmount !== undefined ? a.debtAmount : a.amount;
        valB = b.debtAmount !== undefined ? b.debtAmount : b.amount;
      } else if (sortBy === 'creditAmount') {
        valA = a.creditAmount || 0;
        valB = b.creditAmount || 0;
      } else if (sortBy === 'netAmount') {
        valA = a.netAmount !== undefined ? a.netAmount : ((a.debtAmount || a.amount) - (a.creditAmount || 0));
        valB = b.netAmount !== undefined ? b.netAmount : ((b.debtAmount || b.amount) - (b.creditAmount || 0));
      } else if (sortBy === 'taxCode' || sortBy === 'section') {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [f24Entries, sortBy, sortOrder, filterType]);

  const toggleSort = (field: 'taxCode' | 'debtAmount' | 'creditAmount' | 'netAmount' | 'section') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in" id="modulo-prospetto-f24">
      
      {/* Testata Istituzionale Zucchetti ERP - Modulo Prospetto F24 */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-[#7a0c10] via-[#8b0000] to-[#5a080b] text-white p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-red-950">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-white/10 rounded-2xl border border-white/20 text-emerald-300">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-red-900/80 px-2 py-0.5 rounded text-red-200 font-mono">
                  Modulo Prospetto Analitico F24
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono border border-emerald-400/30">
                  Esercizio {selectedYear}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1">
                Quadratura Tributi, Importi Lordi e Compensazioni F24
              </h2>
            </div>
          </div>

          {/* Action Upload PDF Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => f24InputRef?.current?.click()}
              disabled={isProcessingF24}
              className="bg-white hover:bg-slate-100 text-[#8b0000] font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isProcessingF24 ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#8b0000]" />
              ) : (
                <Upload className="w-4 h-4 text-[#8b0000]" />
              )}
              <span>Carica Nuovo F24 PDF</span>
            </button>
          </div>
        </div>

        {/* Sub-Header con dati Contribuente */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 font-mono">
            <span className="font-bold text-slate-900 uppercase">{profile.fullName}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">{profile.vatNumber ? `P.IVA ${profile.vatNumber}` : ''}</span>
            {profile.fiscalCode && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">CF {profile.fiscalCode}</span>
              </>
            )}
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            Totale Registrazioni Rilevate: <strong className="text-slate-900">{f24Entries.length} quietanze</strong>
          </div>
        </div>
      </div>

      {/* KPI Cards: Totale Debito, Compensazioni e Saldo Netto */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Totale Debito Lordo (A) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Totale Debiti Lordi (A)
            </span>
            <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-mono font-black text-slate-900">
              € {totals.totalDebt.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Somma complessiva dei tributi a debito esposti nei modelli F24
            </p>
          </div>
        </div>

        {/* Totale Compensazioni (B) */}
        <div className={`rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition-all ${
          totals.totalCredit > 0
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            : 'bg-white border-slate-200 text-slate-700'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
              Compensazioni / Crediti (B)
            </span>
            <div className={`p-2 rounded-xl ${totals.totalCredit > 0 ? 'bg-emerald-200/70 text-emerald-900' : 'bg-slate-100 text-slate-400'}`}>
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl sm:text-3xl font-mono font-black ${totals.totalCredit > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
              - € {totals.totalCredit.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-emerald-800/80 mt-1">
              Crediti usati in compensazione orizzontale o verticale
            </p>
          </div>
        </div>

        {/* Saldo Netto Effettivo da Pagare (A - B) */}
        <div className={`rounded-2xl border p-5 shadow-sm flex flex-col justify-between text-white ${
          totals.totalNet === 0 && totals.totalDebt > 0
            ? 'bg-emerald-600 border-emerald-700'
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-[10px] font-black uppercase tracking-wider">
              Saldo Netto Effettivo (A - B)
            </span>
            <div className="p-2 bg-white/10 rounded-xl text-amber-300">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-mono font-black text-white">
              € {totals.totalNet.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-300 mt-1">
              {totals.totalNet === 0 && totals.totalDebt > 0
                ? 'F24 interamente azzerato via compensazioni (Saldo Zero)'
                : 'Importo netto effettivo addebitato tramite delega F24 telematico'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabella Analitica del Prospetto F24 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Barra Filtri e Ordinamento */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mr-2">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              Filtra Righi:
            </span>

            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-[#8b0000] text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Tutti ({f24Entries.length})
            </button>

            <button
              type="button"
              onClick={() => setFilterType('with_credits')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === 'with_credits'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Con Compensazioni ({f24Entries.filter(e => (e.creditAmount || 0) > 0).length})
            </button>

            <button
              type="button"
              onClick={() => setFilterType('acconti')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === 'acconti'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Solo Acconti ({f24Entries.filter(e => e.isAcconto).length})
            </button>

            <button
              type="button"
              onClick={() => setFilterType('saldi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === 'saldi'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Solo Saldi ({f24Entries.filter(e => !e.isAcconto).length})
            </button>
          </div>

          <div className="text-xs text-slate-500 font-mono self-end sm:self-auto">
            Visualizzati: <strong className="text-slate-900">{processedEntries.length} righi</strong>
          </div>
        </div>

        {/* Tabella Dettagliata dei Codici Tributo */}
        {processedEntries.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <FileText className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-600">Nessun rigo F24 trovato con i filtri selezionati.</p>
            <p className="text-xs text-slate-400">Carica un PDF o modifica il filtro per visualizzare il prospetto.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200 select-none">
                <tr>
                  <th className="py-3 px-3.5 cursor-pointer hover:bg-slate-200/70" onClick={() => toggleSort('section')}>
                    <div className="flex items-center gap-1">
                      <span>Sezione</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3.5 cursor-pointer hover:bg-slate-200/70" onClick={() => toggleSort('taxCode')}>
                    <div className="flex items-center gap-1">
                      <span>Codice Tributo</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3.5">Anno / Data</th>
                  <th className="py-3 px-3.5">Descrizione Ministeriale</th>
                  <th className="py-3 px-3.5 text-right cursor-pointer hover:bg-slate-200/70" onClick={() => toggleSort('debtAmount')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Importo Lordo (€)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3.5 text-right cursor-pointer hover:bg-slate-200/70" onClick={() => toggleSort('creditAmount')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Compensazione (€)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3.5 text-right cursor-pointer hover:bg-slate-200/70" onClick={() => toggleSort('netAmount')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Saldo Netto (€)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3.5 text-center">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {processedEntries.map((e) => {
                  const debtVal = e.debtAmount !== undefined ? e.debtAmount : e.amount;
                  const creditVal = e.creditAmount || 0;
                  const netVal = e.netAmount !== undefined ? e.netAmount : (debtVal - creditVal);
                  const entryYear = e.date ? e.date.split('-')[0] : selectedYear;
                  const targetYear = e.isAcconto ? String(parseInt(entryYear, 10) + 1) : entryYear;
                  const hasCredit = creditVal > 0;

                  return (
                    <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Sezione */}
                      <td className="py-3 px-3.5 font-sans">
                        <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                          e.section === 'inps' || e.taxCode.startsWith('P') || e.taxCode.startsWith('C')
                            ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                            : 'bg-red-50 text-[#8b0000] border border-red-200'
                        }`}>
                          {e.section || (e.taxCode.startsWith('P') || e.taxCode.startsWith('C') ? 'INPS' : 'ERARIO')}
                        </span>
                      </td>

                      {/* Codice Tributo */}
                      <td className="py-3 px-3.5 font-bold text-slate-900">
                        <span className="px-2 py-1 bg-slate-100 rounded-md text-xs font-mono border border-slate-200 text-slate-900">
                          {e.taxCode}
                        </span>
                      </td>

                      {/* Anno / Data */}
                      <td className="py-3 px-3.5 text-slate-600 text-xs">
                        <div>{entryYear}</div>
                        <div className="text-[10px] text-slate-400 font-sans">{e.date}</div>
                      </td>

                      {/* Descrizione Ministeriale */}
                      <td className="py-3 px-3.5 font-sans text-slate-700 max-w-xs">
                        <div className="font-bold text-slate-900 text-xs">{e.description || `Tributo ${e.taxCode}`}</div>
                        {e.isAcconto ? (
                          <div className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 mt-0.5">
                            <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>✨ Acconto: confluirà nel calcolo dell'anno {targetYear}</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400">Saldo di competenza {entryYear}</div>
                        )}
                      </td>

                      {/* Importo Lordo (€) */}
                      <td className="py-3 px-3.5 text-right font-bold text-slate-900 text-xs">
                        € {debtVal.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Compensazione (€) */}
                      <td className={`py-3 px-3.5 text-right font-bold text-xs ${
                        hasCredit ? 'text-emerald-700 bg-emerald-50/50' : 'text-slate-400'
                      }`}>
                        {hasCredit ? `- € ${creditVal.toFixed(2)}` : '€ 0,00'}
                      </td>

                      {/* Saldo Netto (€) */}
                      <td className="py-3 px-3.5 text-right font-black text-slate-900 text-sm">
                        € {netVal.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Azioni */}
                      <td className="py-3 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (onInspectDoc) {
                                onInspectDoc({
                                  fileName: e.fileName || `F24_${e.taxCode}_${entryYear}.pdf`,
                                  paymentDate: e.date,
                                  entries: [{
                                    taxCode: e.taxCode,
                                    debtAmount: debtVal,
                                    creditAmount: creditVal,
                                    amount: netVal,
                                    year: entryYear,
                                    section: (e.section as any) || 'erario',
                                    description: e.description
                                  }],
                                  totalDebt: e.totalDebtF24 ?? debtVal,
                                  totalCredit: e.totalCreditF24 ?? creditVal,
                                  netDue: e.netDueF24 ?? netVal,
                                  status: (netVal === 0 && (debtVal > 0 || creditVal > 0)) ? 'saldo_zero' : 'a_debito'
                                });
                              }
                            }}
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer border border-indigo-200/60"
                            title="Apri Modale Prospetto Analitico"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {onDeleteF24Entry && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Vuoi davvero rimuovere questo rigo F24 (Tributo ${e.taxCode})?`)) {
                                  onDeleteF24Entry(e.id);
                                }
                              }}
                              className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer border border-slate-200"
                              title="Elimina Rigo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              
              <tfoot className="bg-slate-100/80 font-bold text-xs border-t-2 border-slate-300 font-mono">
                <tr>
                  <td colSpan={4} className="py-3 px-3.5 font-sans uppercase text-[10px] text-slate-600">
                    Totali Complessivi Esercizio {selectedYear}:
                  </td>
                  <td className="py-3 px-3.5 text-right text-slate-900 font-black">
                    € {totals.totalDebt.toFixed(2)}
                  </td>
                  <td className="py-3 px-3.5 text-right text-emerald-700 font-black">
                    - € {totals.totalCredit.toFixed(2)}
                  </td>
                  <td className="py-3 px-3.5 text-right text-rose-700 font-black text-sm">
                    € {totals.totalNet.toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
