/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BusinessProfile, PensionFundType } from '../types';
import { ATECO_CODES, PENSION_FUNDS, findAtecoCode } from '../taxData';
import { X, Search, Info, HelpCircle, Briefcase, PlusCircle, FolderPlus, Loader2, Check, ExternalLink, ShieldAlert, FolderTree, FolderOpen } from 'lucide-react';
import { createAccountingPositionFolder } from '../utils/googleDrive';
import { safeAlert } from '../utils/safeWindow';

interface AccountingPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, profile: BusinessProfile, folderInfo?: { 
    id: string; 
    url: string;
    fattureEmesseFolderId?: string;
    f24FolderId?: string;
    fileGenericiFolderId?: string;
  }) => void;
  accessToken: string | null;
}

export default function AccountingPositionModal({ isOpen, onClose, onCreate, accessToken }: AccountingPositionModalProps) {
  // Step model state: 'details' then 'destination'
  const [step, setStep] = useState<'details' | 'destination'>('details');

  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [fiscalCode, setFiscalCode] = useState('');
  const [atecoCode, setAtecoCode] = useState('62.01.00');
  const [pensionFund, setPensionFund] = useState<PensionFundType>('INPS_GESTIONE_SEPARATA');
  const [isStartup, setIsStartup] = useState(true);
  const [startYear, setStartYear] = useState('2026');

  // Search local state for ATECO dropdown inside modal
  const [searchTerm, setSearchTerm] = useState('');
  const [showAtecoDropdown, setShowAtecoDropdown] = useState(false);

  // Google Drive destination folder state
  const [parentFolderId, setParentFolderId] = useState('');
  const [selectedParentFolderName, setSelectedParentFolderName] = useState('');
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderCreated, setFolderCreated] = useState(false);
  const [createdFolderUrl, setCreatedFolderUrl] = useState('');
  const [createdFolderId, setCreatedFolderId] = useState('');
  const [createdFattureEmesseFolderId, setCreatedFattureEmesseFolderId] = useState('');
  const [createdF24FolderId, setCreatedF24FolderId] = useState('');
  const [createdFileGenericiFolderId, setCreatedFileGenericiFolderId] = useState('');
  const [errorCreatingFolder, setErrorCreatingFolder] = useState('');

  // Filter ATECO codes
  const filteredAteco = ATECO_CODES.filter(
    (item) =>
      item.code.includes(searchTerm) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedAteco = findAtecoCode(atecoCode);

  useEffect(() => {
    if (isOpen) {
      // Reset form on open
      setName('');
      setFullName('');
      setVatNumber('');
      setFiscalCode('');
      setAtecoCode('62.01.00');
      setPensionFund('INPS_GESTIONE_SEPARATA');
      setIsStartup(true);
      setStartYear('2026');
      setSearchTerm('');
      setShowAtecoDropdown(false);

      // Reset step flow
      setStep('details');
      setParentFolderId('');
      setSelectedParentFolderName('');
      setIsPickerLoading(false);
      setIsCreatingFolder(false);
      setFolderCreated(false);
      setCreatedFolderUrl('');
      setCreatedFolderId('');
      setCreatedFattureEmesseFolderId('');
      setCreatedF24FolderId('');
      setCreatedFileGenericiFolderId('');
      setErrorCreatingFolder('');
    }
  }, [isOpen]);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setStep('destination');
  };

  const handleOpenParentFolderPicker = () => {
    setIsPickerLoading(true);
    const token = accessToken || 'mock-access-token-palmasstudio';
    
    const onPickerLoad = () => {
      const pickerOrigin =
        window.location.ancestorOrigins &&
        window.location.ancestorOrigins.length > 0
          ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
          : window.location.origin;

      const view = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setEnableDrives(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const allView = new (window as any).google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setEnableDrives(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const sharedDrivesView = new (window as any).google.picker.DocsView()
        .setEnableTeamDrives(true)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const picker = new (window as any).google.picker.PickerBuilder()
        .addView(view)
        .addView(allView)
        .addView(sharedDrivesView)
        .enableFeature((window as any).google.picker.Feature.SUPPORT_DRIVES)
        .setOAuthToken(token)
        .setCallback((data: any) => {
          if (data.action === (window as any).google.picker.Action.PICKED) {
            const folder = data.docs[0];
            setParentFolderId(folder.id);
            setSelectedParentFolderName(folder.name);
          }
          if (data.action === (window as any).google.picker.Action.CANCEL || data.action === (window as any).google.picker.Action.PICKED) {
            setIsPickerLoading(false);
          }
        })
        .setOrigin(pickerOrigin)
        .setTitle("Seleziona la cartella genitore in Google Drive")
        .build();
      
      picker.setVisible(true);
    };

    if (!(window as any).google?.picker) {
      if ((window as any).gapi) {
        (window as any).gapi.load('picker', { callback: onPickerLoad });
      } else {
        safeAlert("Google API non ancora caricate. Riprova tra un attimo.");
        setIsPickerLoading(false);
      }
    } else {
      onPickerLoad();
    }
  };

  const handleCreateFolder = async () => {
    setIsCreatingFolder(true);
    setErrorCreatingFolder('');
    try {
      // Access token matching connected account simulation if missing, as required
      const token = accessToken || 'mock-access-token-palmasstudio';
      const folderResult = await createAccountingPositionFolder(token, name.trim(), fullName.trim(), parentFolderId.trim(), startYear);
      setCreatedFolderId(folderResult.id);
      setCreatedFolderUrl(folderResult.url);
      setCreatedFattureEmesseFolderId(folderResult.fattureEmesseFolderId);
      setCreatedF24FolderId(folderResult.f24FolderId);
      setCreatedFileGenericiFolderId(folderResult.fileGenericiFolderId);
      setFolderCreated(true);
    } catch (err: any) {
      console.error(err);
      setErrorCreatingFolder(err.message || String(err));
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleFinalSubmit = () => {
    const newProfile: BusinessProfile = {
      fullName: fullName.trim() || 'Senza Nome',
      vatNumber: vatNumber.trim() || '00000000000',
      fiscalCode: fiscalCode.trim().toUpperCase(),
      atecoCode,
      pensionFund,
      startYear,
      isStartup
    };

    const folderInfo = folderCreated ? {
      id: createdFolderId,
      url: createdFolderUrl,
      fattureEmesseFolderId: createdFattureEmesseFolderId,
      f24FolderId: createdF24FolderId,
      fileGenericiFolderId: createdFileGenericiFolderId
    } : undefined;

    onCreate(name.trim(), newProfile, folderInfo);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      
      <div 
        className="bg-white rounded-3xl w-full max-w-2xl border border-slate-100 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        id="accounting-position-modal"
      >
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950">
              <PlusCircle className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">Crea Nuova Anagrafica</h2>
              <p className="text-[10px] text-slate-400">Inizializza un nuovo profilo fiscale e la cartella Google Drive</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-850 transition-colors cursor-pointer"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Container (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          
          <form onSubmit={(e) => { e.preventDefault(); handleFinalSubmit(); }} className="space-y-6">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              
              {/* Nome / Ragione Sociale */}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Nome / Ragione Sociale</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-medium transition-all text-slate-800"
                  placeholder="Esempio: Mario Rossi"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setName(e.target.value); }}
                />
              </div>

              {/* Partita IVA */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Partita IVA</label>
                <input
                  type="text"
                  maxLength={11}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-mono font-medium transition-all text-slate-800"
                  placeholder="01234567890"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              {/* Codice Fiscale */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Codice Fiscale</label>
                <input
                  type="text"
                  maxLength={16}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-mono font-medium transition-all text-slate-800 uppercase"
                  placeholder="RSSMRA80A01F205Z"
                  value={fiscalCode}
                  onChange={(e) => setFiscalCode(e.target.value.toUpperCase())}
                />
              </div>

              {/* Codice ATECO Primario */}
              <div className="flex flex-col gap-1.5 sm:col-span-2 relative">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Codice ATECO</span>
                  <span className="text-[10px] text-emerald-600 font-extrabold font-mono bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                    Coefficiente: {selectedAteco.coefficient * 100}%
                  </span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-medium transition-all bg-slate-50/20"
                    placeholder="Cerca per codice o descrizione (es: 62.01.00)..."
                    value={searchTerm || `${selectedAteco.code} - ${selectedAteco.description}`}
                    onFocus={() => {
                      setSearchTerm('');
                      setShowAtecoDropdown(true);
                    }}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowAtecoDropdown(true);
                    }}
                  />
                </div>

                {showAtecoDropdown && (
                  <div className="absolute z-30 w-full mt-20 max-h-48 overflow-y-auto bg-white border border-slate-100 rounded-2xl shadow-xl divide-y divide-slate-100 overflow-hidden">
                    {filteredAteco.length > 0 ? (
                      filteredAteco.map((item) => (
                        <button
                          key={item.code}
                          type="button"
                          className="w-full text-left px-5 py-2.5 hover:bg-slate-50 text-xs transition-colors cursor-pointer"
                          onClick={() => {
                            setAtecoCode(item.code);
                            setSearchTerm('');
                            setShowAtecoDropdown(false);
                          }}
                        >
                          <div className="flex justify-between items-center font-bold text-slate-800">
                            <span className="font-mono">{item.code}</span>
                            <span className="bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded text-[10px] font-black">
                              Coeff. {item.coefficient * 100}%
                            </span>
                          </div>
                          <div className="text-slate-500 text-[10px] mt-0.5 truncate">{item.description}</div>
                        </button>
                      ))
                    ) : (
                      <div className="px-5 py-3.5 text-[10px] text-slate-400 font-medium">Nessun codice ATECO trovato.</div>
                    )}
                  </div>
                )}
              </div>

              {/* Cassa Previdenziale */}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Cassa Previdenziale di Riferimento</label>
                <select
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-medium transition-all bg-white text-slate-800"
                  value={pensionFund}
                  onChange={(e) => setPensionFund(e.target.value as PensionFundType)}
                >
                  {PENSION_FUNDS.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Startup agevolata Checkbox */}
              <div className="flex flex-col justify-center py-2 sm:col-span-2">
                <label className="flex items-start gap-3 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    className="w-5 h-5 text-emerald-500 border-slate-300 rounded focus:ring-emerald-500/20 mt-0.5 accent-emerald-500"
                    checked={isStartup}
                    onChange={(e) => setIsStartup(e.target.checked)}
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5 group-hover:text-slate-900 transition-colors">
                      Regime Startup Agevolata (5%)
                    </span>
                  </div>
                </label>
              </div>

              {/* Selezione Cartella Contenitore */}
              <div className="flex flex-col gap-1.5 sm:col-span-2 border-t border-slate-100 pt-5 mt-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Cartella Genitore (Nidificazione Google Drive)</span>
                  {parentFolderId && (
                    <span className="text-[9px] font-mono bg-sky-50 text-sky-650 px-1.5 py-0.5 rounded border border-sky-100 uppercase tracking-wide">ID: {parentFolderId.substring(0, 8)}...</span>
                  )}
                </label>
                <p className="text-[10px] text-slate-400">
                  Opzionale: Sfoglia le tue directory di Google Drive (incluso "Il mio computer", "Il mio laptop" o altre sotto-cartelle) in cui nidificare questa anagrafica. Se eviti di selezionarne una, la cartella dell'anagrafica verrà generata nella directory radice.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3 mt-1.5">
                  <button
                    type="button"
                    onClick={handleOpenParentFolderPicker}
                    disabled={isPickerLoading || folderCreated}
                    className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0 min-w-[150px]"
                  >
                    {isPickerLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                    ) : (
                      <FolderTree className="w-4 h-4 text-sky-650 text-sky-600" />
                    )}
                    Sfoglia Drive...
                  </button>
                  
                  <div className="flex-1 min-w-0 bg-slate-50 px-4 py-2.5 rounded-xl border border-dashed border-slate-200 text-xs flex items-center justify-between">
                    {parentFolderId ? (
                      <div className="flex items-center gap-2 min-w-0 text-slate-800">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-bold truncate">Nidifica dentro: "{selectedParentFolderName}"</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Nidifica nella radice principale (My Drive)</span>
                    )}
                    
                    {parentFolderId && !folderCreated && (
                      <button
                        type="button"
                        onClick={() => {
                          setParentFolderId('');
                          setSelectedParentFolderName('');
                        }}
                        className="text-[10px] text-red-500 hover:text-red-700 font-bold hover:underline shrink-0 cursor-pointer ml-3"
                      >
                        Ripristina Default
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Azioni di Creazione in col-span-2 container */}
              <div className="flex flex-col gap-4 sm:col-span-2 bg-slate-50 p-5 rounded-2xl border border-slate-200 mt-2">
                
                <div className="flex gap-4">
                  {/* Pulsante Creazione Cartella Drive */}
                  <button
                    type="button"
                    disabled={isCreatingFolder || !name || folderCreated}
                    onClick={handleCreateFolder}
                    className={`flex-1 py-3 px-4 rounded-xl text-[11px] font-bold transition-all shadow-sm flex flex-col items-center justify-center gap-1.5 border min-h-[80px] ${folderCreated ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'}`}
                  >
                    {isCreatingFolder ? (
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                    ) : folderCreated ? (
                      <Check className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <FolderPlus className="w-5 h-5 text-sky-600" />
                    )}
                    <span className="text-center">{folderCreated ? 'Cartella e Struttura Generate!' : 'Creazione Cartella Drive'}</span>
                  </button>

                  {/* Pulsante Crea Anagrafica */}
                  <button
                    type="submit"
                    disabled={!fullName || !vatNumber || !fiscalCode}
                    className="flex-1 py-3 px-4 bg-slate-900 disabled:bg-slate-300 disabled:text-slate-500 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold shadow-md hover:shadow-lg transition-all flex flex-col items-center justify-center gap-1.5 border border-transparent min-h-[80px]"
                  >
                    <PlusCircle className="w-5 h-5 text-emerald-400" />
                    <span className="text-center text-white">Crea Anagrafica</span>
                  </button>
                </div>
                
                {!folderCreated ? (
                  <p className="text-[10px] text-slate-500 text-center">
                    Nota: Puoi creare subito l'anagrafica locale. Se vuoi anche generare la sua cartella dedicata in Google Drive, clicca prima "Creazione Cartella Drive".
                  </p>
                ) : (
                  <p className="text-[10px] text-emerald-600 text-center font-bold">
                    ✓ Cartella e struttura Google Drive generate correttamente! Clicca "Crea Anagrafica" per completare il salvataggio.
                  </p>
                )}

                {errorCreatingFolder && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-600 font-medium text-center">
                    ⚠️ {errorCreatingFolder}
                  </div>
                )}
                
                {folderCreated && (
                  <a 
                    href={createdFolderUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="inline-flex items-center justify-center gap-1 mt-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline text-center w-full"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Visualizza in Drive
                  </a>
                )}
                
              </div>
            </div>

          </form>

        </div>

      </div>

    </div>
  );
}
