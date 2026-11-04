/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  FolderSearch, 
  ExternalLink, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FolderCheck, 
  FileText, 
  Calendar, 
  User, 
  Sparkles,
  Cloud,
  Layers
} from 'lucide-react';
import { DriveAccountingSearchResult, searchDriveForAccountingPositions, importAccountingPositionFromDrive } from '../utils/googleDrive';
import { AccountingPosition } from '../types';

interface DriveSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  onGoogleLogin?: () => Promise<void>;
  existingPositions: AccountingPosition[];
  onPositionImported: (newPosition: AccountingPosition) => void;
  onSelectPosition: (positionId: string) => void;
  initialQuery?: string;
  selectedYear?: string;
}

export default function DriveSearchModal({
  isOpen,
  onClose,
  accessToken,
  onGoogleLogin,
  existingPositions,
  onPositionImported,
  onSelectPosition,
  initialQuery = 'Maros Valeria',
  selectedYear = '2026'
}: DriveSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<DriveAccountingSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Set query and auto-search on opening if initialQuery is set
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setErrorMsg(null);
      // Run search automatically when modal opens
      handleSearch(initialQuery);
    }
  }, [isOpen, initialQuery]);

  const handleSearch = async (searchTermToUse?: string) => {
    const term = typeof searchTermToUse === 'string' ? searchTermToUse : query;
    setIsSearching(true);
    setErrorMsg(null);
    setHasSearched(true);

    if (!accessToken || accessToken.includes('mock-')) {
      setIsSearching(false);
      setErrorMsg("Connetti prima il tuo account Google Drive dall'apposito pulsante per cercare le contabilità.");
      return;
    }

    try {
      const searchRes = await searchDriveForAccountingPositions(accessToken, term);
      setResults(searchRes);
    } catch (err: any) {
      console.error("Search error:", err);
      setErrorMsg("Errore durante la ricerca su Google Drive: " + (err.message || err.toString()));
    } finally {
      setIsSearching(false);
    }
  };

  const handleImport = async (item: DriveAccountingSearchResult) => {
    setImportingId(item.id);
    setErrorMsg(null);

    if (!accessToken || accessToken.includes('mock-')) {
      setImportingId(null);
      setErrorMsg("Connetti prima il tuo account Google Drive per importare la posizione.");
      return;
    }

    try {
      const newPos = await importAccountingPositionFromDrive(accessToken, item, selectedYear);
      onPositionImported(newPos);
      onClose();
    } catch (err: any) {
      console.error("Import error:", err);
      setErrorMsg("Impossibile importare la posizione contabile: " + (err.message || err.toString()));
    } finally {
      setImportingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <FolderSearch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Cerca Contabilità su Google Drive
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/30">
                  Directory forfettari
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Trova e ripristina la cartella di Valeria Maros o di qualsiasi altro cliente da Google Drive
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Quick suggestions */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-900/60 flex flex-col gap-3">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome o cognome cliente (es. Maros Valeria, Valeria Maros)..."
                className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500/60 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all shadow-inner"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-lg shadow-emerald-950/40"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Ricerca...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Cerca su Drive</span>
                </>
              )}
            </button>
          </form>

          {/* Quick pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 font-medium mr-1">Ricerche rapide:</span>
            <button
              type="button"
              onClick={() => {
                setQuery('Valeria Maros');
                handleSearch('Valeria Maros');
              }}
              className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3" /> Valeria Maros
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery('Maros Valeria');
                handleSearch('Maros Valeria');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              Maros Valeria
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                handleSearch('');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              📁 Scansiona tutti i forfettari
            </button>
          </div>

          {!accessToken && onGoogleLogin && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Per cercare nei tuoi file live su Google Drive (Palmasstudio@gmail.com), effettua l'accesso Google.
                </span>
              </div>
              <button
                type="button"
                onClick={onGoogleLogin}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
              >
                Connetti Drive
              </button>
            </div>
          )}
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isSearching && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <p className="text-xs">Ricerca cartelle e documenti fiscali su Google Drive in corso...</p>
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <FolderSearch className="w-10 h-10 text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">Nessuna cartella trovata per "{query}"</p>
              <p className="text-xs text-slate-500 max-w-sm">
                Verifica che il nome corrisponda alla cartella su Google Drive o prova a scansionare tutte le posizioni.
              </p>
            </div>
          )}

          {!isSearching && results.map((item) => {
            // Check if already in existing positions
            const alreadyExists = existingPositions.find(
              (p) => p.driveFolderId === item.id || 
                     (p.profile?.fullName && p.profile.fullName.toLowerCase() === item.cleanedName.toLowerCase())
            );

            const isThisImporting = importingId === item.id;

            return (
              <div 
                key={item.id}
                className="p-4 bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                    <User className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-white truncate">
                        {item.cleanedName}
                      </h3>
                      <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {item.name}
                      </span>
                    </div>

                    {/* Metadata details */}
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                      {item.sampleIssuer?.vat && (
                        <span>P.IVA: <strong className="text-slate-300 font-mono">{item.sampleIssuer.vat}</strong></span>
                      )}
                      {item.sampleIssuer?.cf && (
                        <span>CF: <strong className="text-slate-300 font-mono">{item.sampleIssuer.cf}</strong></span>
                      )}
                      <span className="flex items-center gap-1 text-slate-400">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        Anni: {item.years.join(', ') || '2025, 2026'}
                      </span>
                      {item.invoiceCount > 0 && (
                        <span className="flex items-center gap-1 text-emerald-400 font-medium">
                          <FileText className="w-3 h-3" />
                          {item.invoiceCount} {item.invoiceCount === 1 ? 'fattura' : 'fatture'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs transition-colors"
                    title="Apri cartella su Google Drive"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  {alreadyExists ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPosition(alreadyExists.id);
                        onClose();
                      }}
                      className="px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Seleziona Posizione
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isThisImporting}
                      onClick={() => handleImport(item)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-950/40 disabled:opacity-50"
                    >
                      {isThisImporting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Importazione...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Importa nel Gestionale</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <FolderCheck className="w-3.5 h-3.5 text-emerald-500" />
            Cartella principale forfettari: ID 1ogkOOPaH3EwYUV-DO-GHgZ0HswocM7E8
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-lg text-xs font-medium cursor-pointer transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
