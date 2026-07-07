import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type ThemeType = 'vibrant' | 'swiss' | 'cosmic' | 'editorial' | 'retro';

interface ThemeOption {
  id: ThemeType;
  name: string;
  description: string;
  previewUrl: string;
}

const THEMES: ThemeOption[] = [
  {
    id: 'vibrant',
    name: 'Modern Vibrant',
    description: 'Interfaccia moderna, colorata e intuitiva.',
    previewUrl: '/src/assets/images/modern_vibrant_preview_1783440763879.jpg'
  },
  {
    id: 'swiss',
    name: 'Minimalist Swiss',
    description: 'Ispirato allo stile svizzero: pulizia estrema e contrasto.',
    previewUrl: '/src/assets/images/minimalist_swiss_preview_1783440713659.jpg'
  },
  {
    id: 'cosmic',
    name: 'Cosmic Dark',
    description: 'Modalità scura futuristica con accenti neon e trasparenze.',
    previewUrl: '/src/assets/images/cosmic_dark_preview_1783440725816.jpg'
  },
  {
    id: 'editorial',
    name: 'Warm Editorial',
    description: 'Eleganza tipografica e toni caldi da rivista di business.',
    previewUrl: '/src/assets/images/warm_editorial_preview_1783440738290.jpg'
  },
  {
    id: 'retro',
    name: 'Retro Terminal',
    description: 'Estetica hacker anni \'90 con font monospazio e colori CRT.',
    previewUrl: '/src/assets/images/retro_terminal_preview_1783440752142.jpg'
  }
];

interface ThemeSelectorProps {
  currentTheme: ThemeType;
  onThemeChange: (theme: ThemeType) => void;
}

export default function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 rounded-full text-slate-500 hover:bg-slate-50 border border-slate-200 hover:text-slate-800 transition-all active:scale-95 bg-white shadow-sm"
        title="Cambia Modello Estetico"
      >
        <Palette className="w-4 h-4" />
        <span className="hidden lg:inline text-[11px] font-bold uppercase tracking-wider">Aesthetics</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-3 w-[280px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 z-[100] overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-4 px-1">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Modelli Estetici</h3>
            </div>

            <div className="space-y-3">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onThemeChange(t.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left group relative overflow-hidden rounded-xl transition-all ${
                    currentTheme === t.id 
                      ? 'ring-2 ring-indigo-500 ring-offset-2' 
                      : 'hover:border-slate-300'
                  }`}
                >
                  <div className="relative h-20 w-full bg-slate-100 overflow-hidden">
                    <img 
                      src={t.previewUrl} 
                      alt={t.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                    <div className={`absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors ${currentTheme === t.id ? 'bg-black/5' : ''}`} />
                    
                    {currentTheme === t.id && (
                      <div className="absolute top-2 right-2 bg-indigo-500 text-white p-1 rounded-full shadow-lg">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 bg-white border border-t-0 border-slate-100">
                    <div className="text-xs font-extrabold text-slate-900 mb-0.5">{t.name}</div>
                    <div className="text-[10px] text-slate-500 leading-tight">{t.description}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 text-center">
              <p className="text-[9px] text-slate-400 italic">
                Cambia istantaneamente font, colori e atmosfera.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
