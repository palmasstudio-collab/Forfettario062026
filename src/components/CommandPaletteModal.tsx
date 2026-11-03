/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Calculator, 
  Layers, 
  BookOpen, 
  ShieldCheck, 
  FileText, 
  Clock, 
  Download, 
  Command, 
  Sparkles,
  X,
  FileCheck2,
  CheckCircle2
} from 'lucide-react';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tabId: string) => void;
  onTriggerPdfExport: () => void;
  f24EntriesCount: number;
  invoicesCount: number;
}

export default function CommandPaletteModal({
  isOpen,
  onClose,
  onSelectTab,
  onTriggerPdfExport,
  f24EntriesCount,
  invoicesCount
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Keyboard listener for ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open triggered from outside
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands = [
    {
      id: 'prospetto_f24',
      title: 'Modulo Prospetto F24 (Quadratura Tributi e Compensazioni)',
      description: 'Visualizza la tabella con codici tributo, lordo, compensazioni e saldo netto',
      category: 'Navigazione Moduli',
      icon: Layers,
      badge: `${f24EntriesCount} quietanze`,
      action: () => { onSelectTab('prospetto_f24'); onClose(); }
    },
    {
      id: 'quadro_lm',
      title: 'Quadro LM (Dichiarazione Imposta Sostitutiva 5%/15%)',
      description: 'Facsimile righi LM22, LM34, LM35, LM38, LM40, LM42, LM43',
      category: 'Dichiarazione Fiscale',
      icon: BookOpen,
      action: () => { onSelectTab('quadro_lm'); onClose(); }
    },
    {
      id: 'quadro_rr',
      title: 'Quadro RR (Contributi INPS Gestione Separata PXX)',
      description: 'Facsimile Sezione II contributi previdenziali e scomputo acconti',
      category: 'Dichiarazione Fiscale',
      icon: ShieldCheck,
      action: () => { onSelectTab('quadro_rr'); onClose(); }
    },
    {
      id: 'ravvedimento',
      title: 'Calcolatore Ravvedimento Operoso & Scadenzario',
      description: 'Calcola sanzioni ridotte (0.1%/giorno) ed interessi legali per F24 tardivi',
      category: 'Strumenti ERP',
      icon: Clock,
      action: () => { onSelectTab('ravvedimento'); onClose(); }
    },
    {
      id: 'invoices',
      title: 'Registro Fatture XML & Audit Buco Numerazione',
      description: 'Elenco completo fatture emesse, incassi e report gap numerazione SDI',
      category: 'Contabilità',
      icon: FileText,
      badge: `${invoicesCount} fatture`,
      action: () => { onSelectTab('invoices'); onClose(); }
    },
    {
      id: 'export_pdf',
      title: 'Esporta Fascicolo Fiscale PDF Completo',
      description: 'Genera il bilancio preventivo con prospetto F24 e fascicolo ministeriale',
      category: 'Stampa e Report',
      icon: Download,
      action: () => { onTriggerPdfExport(); onClose(); }
    }
  ];

  const filteredCommands = commands.filter(cmd =>
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center pt-20 px-4 animate-fade-in">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Barra di Ricerca Command Palette */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
          <div className="p-2 bg-[#8b0000] text-white rounded-lg">
            <Command className="w-5 h-5" />
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder="Digita un comando, codice tributo (es. 1792, PXX) o modulo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
          />
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Elenco Risultati Palette */}
        <div className="p-2 max-h-[380px] overflow-y-auto divide-y divide-slate-100">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nessun comando o modulo trovato per "{query}"
            </div>
          ) : (
            filteredCommands.map((cmd) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  className="w-full text-left p-3 hover:bg-slate-50 rounded-xl transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 group-hover:bg-[#8b0000] group-hover:text-white text-slate-600 rounded-xl transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-900">{cmd.title}</span>
                        {cmd.badge && (
                          <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                            {cmd.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{cmd.description}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono font-bold bg-slate-100 px-2 py-1 rounded">
                    {cmd.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Tastiera Info */}
        <div className="bg-slate-100 px-4 py-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            <span>Usa tastiera:</span>
            <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 font-bold">ESC</span>
            <span>chiudi</span>
          </div>
          <div className="flex items-center gap-1 text-[#8b0000] font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Zucchetti ERP Quick Engine</span>
          </div>
        </div>
      </div>
    </div>
  );
}
