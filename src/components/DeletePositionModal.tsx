import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { AccountingPosition } from '../types';

interface DeletePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  position: AccountingPosition | null;
}

export default function DeletePositionModal({ isOpen, onClose, onConfirm, position }: DeletePositionModalProps) {
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
    }
  }, [isOpen]);

  if (!isOpen || !position) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText === 'ELIMINA') {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-3xl w-full max-w-md border border-slate-100 shadow-2xl flex flex-col overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        id="delete-position-modal"
      >
        <div className="p-6 border-b border-rose-100 flex items-center justify-between bg-rose-50 shrinks-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500 rounded-2xl flex items-center justify-center text-white">
              <Trash2 className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-rose-900 tracking-tight">Elimina Posizione</h2>
              <p className="text-[10px] text-rose-600 font-medium">Azione irreversibile</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 bg-white overflow-y-auto">
          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 mb-6 font-medium text-xs text-rose-800 leading-relaxed">
            <div className="flex items-center gap-2 mb-2 font-black text-rose-900 text-sm">
              <AlertTriangle className="w-4 h-4" /> Attenzione!
            </div>
            Stai per eliminare definitivamente la posizione contabile <strong>"{position.name}"</strong> 
            (Profilo: {position.profile.fullName || 'Senza nome'}). 
            Tutte le fatture, simulazioni e scadenze ad essa associate verranno perse localmente. Anche il backup su cloud verrà sovrascritto se attivo.
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-extrabold text-slate-500 mb-1">
                Conferma Eliminazione
              </label>
              <p className="text-[10px] text-slate-400 mb-2 font-medium">
                Digita <strong className="text-rose-600">ELIMINA</strong> per confermare l'operazione.
              </p>
              <input
                type="text"
                required
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="ELIMINA"
                className="w-full bg-slate-50 border border-slate-200 focus:border-rose-500 focus:ring focus:ring-rose-200/50 px-4 py-3 rounded-xl text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-300"
              />
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={confirmText !== 'ELIMINA'}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow"
              >
                <Trash2 className="w-4 h-4" />
                Elimina Definitivamente
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
