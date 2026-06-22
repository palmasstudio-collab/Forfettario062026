/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { BusinessProfile, PensionFundType } from '../types';
import { ATECO_CODES, PENSION_FUNDS, importAtecoRegistryFromPdf, findAtecoCode } from '../taxData';
import { Building, Search, Info, HelpCircle, HardDriveDownload, Loader2, FolderPlus, Check, Save } from 'lucide-react';
import { safeAlert } from '../utils/safeWindow';

interface BusinessProfileCardProps {
  profile: BusinessProfile;
  onChange: (profile: BusinessProfile) => void;
  isCreatingFolder?: boolean;
  driveFolderCreated?: boolean;
  onCreateDriveFolder?: () => void;
  onSaveAnagrafica?: () => void;
  isUnselected?: boolean;
}

export default function BusinessProfileCard({ 
  profile, 
  onChange,
  isCreatingFolder = false,
  driveFolderCreated = false,
  onCreateDriveFolder,
  onSaveAnagrafica,
  isUnselected = false
}: BusinessProfileCardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAtecoDropdown, setShowAtecoDropdown] = useState(false);
  const [isAtecoFocused, setIsAtecoFocused] = useState(false);
  const [isImportingAteco, setIsImportingAteco] = useState(false);
  const [hasImported, setHasImported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtra i codici ateco per ricerca testuale o codice
  const filteredAteco = ATECO_CODES.filter(
    (item) =>
      item.code.includes(searchTerm) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedAteco = findAtecoCode(profile.atecoCode);

  const handleUpdateField = (field: keyof BusinessProfile, value: any) => {
    onChange({
      ...profile,
      [field]: value,
    });
  };

  const handleSelectAteco = (code: string) => {
    handleUpdateField('atecoCode', code);
    setSearchTerm('');
    setShowAtecoDropdown(false);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImportingAteco(true);
      await importAtecoRegistryFromPdf(file);
      setHasImported(true);
    } catch (error) {
      console.error('Failed to import ATECO from PDF', error);
      safeAlert('Errore durante il caricamento o elaborazione del PDF ATECO.');
    } finally {
      setIsImportingAteco(false);
      // Reset input per permettere nuovo caricamento se necessario
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8" id="business-profile-card">
      {isUnselected && (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 text-slate-800 rounded-2xl flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-extrabold text-slate-900">Nessuna Contabilità Selezionata</p>
            <p className="text-slate-600 leading-relaxed mt-1">
              I moduli del profilo dell'attività sono vuoti. Seleziona una contabilità dall'elenco a tendina in alto a sinistra o creane una nuova ("+ NUOVO") per visualizzare o inserire dati reali.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-600">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Profilo Attività Forfettaria</h2>
            <p className="text-xs text-slate-500">Configura i parametri fiscali e previdenziali essenziali della tua partita IVA</p>
          </div>
        </div>
        
        <div>
          <input 
            type="file" 
            accept="application/pdf" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
          />
          <button 
            onClick={handleImportClick}
            disabled={isImportingAteco || isUnselected}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-70 cursor-pointer"
          >
            {isImportingAteco ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />}
            <span>{isImportingAteco ? "Elaborazione PDF..." : (hasImported ? "PDF Aggiornato" : "Carica PDF ATECO aggiornato")}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Nome / Ragione Sociale */}
        <div className="flex flex-col gap-1.5 font-sans">
          <label className="text-xs font-bold text-slate-705 uppercase tracking-wider">Nome Completo / Ragione Sociale</label>
          <input
            type="text"
            disabled={isUnselected}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-medium transition-all disabled:bg-slate-50 disabled:text-slate-400"
            placeholder={isUnselected ? "Nessuna contabilità selezionata" : "Nome Cognome S.r.l."}
            value={profile.fullName}
            onChange={(e) => handleUpdateField('fullName', e.target.value)}
          />
        </div>

        {/* Partita IVA */}
        <div className="flex flex-col gap-1.5 font-sans">
          <label className="text-xs font-bold text-slate-705 uppercase tracking-wider">Partita IVA</label>
          <input
            type="text"
            maxLength={11}
            disabled={isUnselected}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-mono font-medium transition-all disabled:bg-slate-50 disabled:text-slate-400"
            placeholder={isUnselected ? "Nessuna contabilità selezionata" : "01234567890"}
            value={profile.vatNumber}
            onChange={(e) => handleUpdateField('vatNumber', e.target.value.replace(/\D/g, ''))}
          />
        </div>

        {/* Codice Fiscale */}
        <div className="flex flex-col gap-1.5 font-sans">
          <label className="text-xs font-bold text-slate-705 uppercase tracking-wider">Codice Fiscale</label>
          <input
            type="text"
            maxLength={16}
            disabled={isUnselected}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-mono font-medium transition-all uppercase disabled:bg-slate-50 disabled:text-slate-400"
            placeholder={isUnselected ? "Nessuna contabilità selezionata" : "RSSMRA80A01F205Z"}
            value={profile.fiscalCode || ''}
            onChange={(e) => handleUpdateField('fiscalCode', e.target.value.toUpperCase())}
          />
        </div>

        {/* Codice ATECO Search & Autocomplete */}
        <div className="flex flex-col gap-1.5 md:col-span-2 relative">
          <label className="text-xs font-bold text-slate-705 uppercase tracking-wider flex items-center justify-between">
            <span>Codice ATECO Primario (con coefficiente di redditività)</span>
            <span className="text-xs text-emerald-600 font-extrabold font-mono bg-emerald-500/10 px-2 py-0.5 rounded-lg">
              Coeff. Redditività: {selectedAteco.coefficient * 100}%
            </span>
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              disabled={isUnselected}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-medium transition-all bg-slate-50/30 disabled:bg-slate-50 disabled:text-slate-400"
              placeholder={isUnselected ? "Nessuna contabilità selezionata" : "Cerca per codice o descrizione (es: 86.99.01)..."}
              value={isUnselected ? '' : (isAtecoFocused ? searchTerm : `${selectedAteco.code} - ${selectedAteco.description}`)}
              onFocus={() => {
                if (!isUnselected) {
                  setSearchTerm('');
                  setIsAtecoFocused(true);
                  setShowAtecoDropdown(true);
                }
              }}
              onBlur={() => {
                if (!isUnselected) {
                  setTimeout(() => {
                    setIsAtecoFocused(false);
                    setShowAtecoDropdown(false);
                  }, 250);
                }
              }}
              onChange={(e) => {
                if (!isUnselected) {
                  setSearchTerm(e.target.value);
                  setShowAtecoDropdown(true);
                }
              }}
            />
          </div>

          {showAtecoDropdown && (
            <div className="absolute z-10 w-full mt-20 max-h-60 overflow-y-auto bg-white border border-slate-100 rounded-2xl shadow-lg divide-y divide-slate-50 overflow-hidden">
              {filteredAteco.length > 0 ? (
                filteredAteco.slice(0, 50).map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className="w-full text-left px-5 py-3 hover:bg-slate-50 last:border-b-0 text-sm transition-colors cursor-pointer"
                    onClick={() => handleSelectAteco(item.code)}
                  >
                    <div className="flex justify-between items-center font-bold text-slate-800">
                      <span className="font-mono">{item.code}</span>
                      <span className="bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded text-xs font-black">
                        Coeff. {item.coefficient * 100}%
                      </span>
                    </div>
                    <div className="text-slate-500 text-xs mt-0.5">{item.description}</div>
                  </button>
                ))
              ) : (
                <div className="px-5 py-4 text-xs text-slate-400 font-medium">Nessun codice ATECO trovato. Riprova con altre parole chiave.</div>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-400 leading-relaxed mt-1 flex items-start gap-1">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Il <strong>Coefficiente di Redditività</strong> decide a monte la percentuale imponibile di ricavo. Es. per programmatori (ATECO 62.01.00) è il <strong>67%</strong>, ovvero viene considerata una spesa teorica del 33% senza bisogno di giustificativi fiscali.
            </span>
          </p>
        </div>

        {/* Cassa Previdenziale */}
        <div className="flex flex-col gap-1.5 font-sans">
          <label className="text-xs font-bold text-slate-705 uppercase tracking-wider">Cassa Previdenziale di Riferimento</label>
          <select
            disabled={isUnselected}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-medium transition-all bg-white disabled:bg-slate-50 disabled:text-slate-400"
            value={profile.pensionFund}
            onChange={(e) => handleUpdateField('pensionFund', e.target.value as PensionFundType)}
          >
            {PENSION_FUNDS.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
        </div>

        {/* Startup Checkbox & Start year */}
        <div className="flex flex-col justify-end p-1">
          <label className="flex items-start gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              disabled={isUnselected}
              className="w-4.5 h-4.5 text-emerald-500 border-slate-300 rounded focus:ring-emerald-500/20 mt-0.5 accent-emerald-505 disabled:opacity-50"
              checked={profile.isStartup}
              onChange={(e) => handleUpdateField('isStartup', e.target.checked)}
            />
            <div>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5 group-hover:text-slate-900 transition-colors">
                Regime Aliquota Startup Agevolata (5%)
                <span className="relative inline-block">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                  <span className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 w-52 bg-slate-955 text-white rounded-lg text-[10px] p-2 leading-relaxed opacity-0 group-hover:opacity-100 transition duration-150 z-20 shadow-xl border border-slate-800">
                    Soddisfa i requisiti di novità dell'attività e godi della tassazione sostitutiva ridotta al 5% invece del 15% per i primi 5 anni.
                  </span>
                </span>
              </span>
              <p className="text-xs text-slate-500 mt-1">
                Applica l'imposta sostitutiva ridotta al 5% invece del 15%.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Azioni di Creazione/Integrazione Drive */}
      <div className="flex flex-col gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200 mt-6 md:col-span-2">
        <div className="flex gap-4">
          {/* Pulsante Creazione Cartella Drive */}
          <button
            type="button"
            disabled={isUnselected || isCreatingFolder || driveFolderCreated || !profile.fullName}
            onClick={onCreateDriveFolder}
            className={`flex-1 py-3 px-4 rounded-xl text-[11px] font-bold transition-all shadow-sm flex flex-col items-center justify-center gap-1.5 border min-h-[80px] ${driveFolderCreated ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 disabled:opacity-50'}`}
          >
            {isCreatingFolder ? (
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
            ) : driveFolderCreated ? (
              <Check className="w-5 h-5 text-emerald-600" />
            ) : (
              <FolderPlus className="w-5 h-5 text-sky-600" />
            )}
            <span className="text-center">{driveFolderCreated ? 'Cartella e Struttura Generate!' : 'Creazione Cartella Drive'}</span>
          </button>

          {/* Pulsante Crea Anagrafica */}
          <button
            type="button"
            disabled={isUnselected || !driveFolderCreated || !profile.fullName || !profile.vatNumber}
            onClick={onSaveAnagrafica}
            className="flex-1 py-3 px-4 bg-slate-900 disabled:bg-slate-200 disabled:text-slate-405 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold shadow-md hover:shadow-lg transition-all flex flex-col items-center justify-center gap-1.5 border border-transparent min-h-[80px] cursor-pointer"
          >
            <Save className={`w-5 h-5 ${driveFolderCreated ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span className="text-center">Crea Anagrafica</span>
          </button>
        </div>
        
        {!driveFolderCreated && (
          <p className="text-[10px] text-slate-500 text-center">
            (Clicca "Creazione Cartella Drive" per generare l'albero di directory prima di poter confermare l'anagrafica)
          </p>
        )}
      </div>

    </div>
  );
}
