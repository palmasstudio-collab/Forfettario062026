/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Upload, Check, RefreshCw, AlertCircle, FileText, Image as ImageIcon, ChevronRight } from 'lucide-react';
import { BusinessProfile } from '../types';
import { extractF24DataFromPdf } from '../utils/pdfF24Parser';

// Initialize PDFJS Worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
} catch (e) {
  console.warn("Failed to set PDF worker path:", e);
}

interface F24PreviewCanvasProps {
  profile: BusinessProfile;
  selectedYear: string;
  onAddF24Entries?: (entries: any[]) => void;
  f24Files?: { name: string; id: string; url: string; dateAdded: string }[];
}

export default function F24PreviewCanvas({
  profile,
  selectedYear,
  onAddF24Entries,
  f24Files = []
}: F24PreviewCanvasProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'pdf' | 'image' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  // F24 Form values (synced with coordinates over the canvas)
  const [formState, setFormState] = useState({
    fiscalCode: profile.fiscalCode || '',
    fullName: profile.fullName || '',
    // Erario
    erarioCodice: '1790',
    erarioRateazione: '0101',
    erarioAnno: selectedYear,
    erarioImporto: '',
    // INPS
    inpsSede: '8200',
    inpsCausale: 'P10',
    inpsMatricola: profile.fiscalCode || '',
    inpsPeriodoDa: `01${selectedYear}`,
    inpsPeriodoA: `12${selectedYear}`,
    inpsImporto: '',
    // Totale
    saldoFinale: ''
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync profile data when props change
  useEffect(() => {
    setFormState(prev => ({
      ...prev,
      fiscalCode: profile.fiscalCode || prev.fiscalCode,
      fullName: profile.fullName || prev.fullName,
      erarioAnno: selectedYear,
      inpsPeriodoDa: `01${selectedYear}`,
      inpsPeriodoA: `12${selectedYear}`
    }));
  }, [profile, selectedYear]);

  // Handle PDF/Image File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    await loadFile(selectedFile);
  };

  const loadFile = async (selectedFile: File) => {
    setFile(selectedFile);
    const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
    setFileType(isPdf ? 'pdf' : 'image');
    setIsProcessing(true);
    setStatusMessage('Analisi del file in corso...');

    try {
      if (isPdf) {
        // Run OCR parsing to auto-fill the form coordinates
        const parsedEntries = await extractF24DataFromPdf(selectedFile);
        if (parsedEntries.length > 0) {
          // Fill first matched entry
          const entry = parsedEntries[0];
          const isErario = ['1790', '1791', '1792', '4001', '4002'].includes(entry.taxCode);
          
          setFormState(prev => ({
            ...prev,
            erarioCodice: isErario ? entry.taxCode : prev.erarioCodice,
            erarioImporto: isErario ? entry.amount.toFixed(2) : prev.erarioImporto,
            erarioAnno: entry.year || prev.erarioAnno,
            inpsCausale: !isErario ? entry.taxCode : prev.inpsCausale,
            inpsImporto: !isErario ? entry.amount.toFixed(2) : prev.inpsImporto,
            saldoFinale: entry.amount.toFixed(2)
          }));
          setStatusMessage(`F24 analizzato correttamente. Rilevato tributo ${entry.taxCode} per € ${entry.amount.toFixed(2)}.`);
        } else {
          setStatusMessage('File caricato. Nessun tributo estratto in automatico: puoi compilarlo manualmente.');
        }
      } else {
        setStatusMessage('Immagine caricata. Compila i campi per sovrapporre i dati visivamente.');
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('File caricato con avvisi durante l\'estrazione automatica.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Render PDF / Image onto the HTML5 Canvas
  useEffect(() => {
    if (!file || !canvasRef.current) return;
    
    let isCurrent = true;
    setIsRendering(true);

    const render = async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (fileType === 'pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          
          if (!isCurrent) return;
          const page = await pdf.getPage(1);
          
          if (!isCurrent) return;
          
          // Render with a high quality scale, responsive layout handles resizing
          const desiredWidth = 800;
          const initialViewport = page.getViewport({ scale: 1.0 });
          const scale = desiredWidth / initialViewport.width;
          const viewport = page.getViewport({ scale });

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const renderContext = {
            canvasContext: ctx,
            viewport: viewport
          };
          await page.render(renderContext as any).promise;
        } else {
          // Render PNG/JPEG Image
          const reader = new FileReader();
          reader.onload = (event) => {
            if (!isCurrent) return;
            const img = new Image();
            img.onload = () => {
              if (!isCurrent) return;
              canvas.width = img.naturalWidth || 800;
              canvas.height = img.naturalHeight || 1130;
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = event.target?.result as string;
          };
          reader.readAsDataURL(file);
        }
      } catch (err) {
        console.error("Error rendering canvas background:", err);
      } finally {
        if (isCurrent) {
          setIsRendering(false);
        }
      }
    };

    render();

    return () => {
      isCurrent = false;
    };
  }, [file, fileType]);

  const handleInputChange = (field: string, value: string) => {
    setFormState(prev => {
      const updated = { ...prev, [field]: value };
      
      // Keep final balance in sync with active filled amount
      if (field === 'erarioImporto') {
        updated.saldoFinale = value;
      } else if (field === 'inpsImporto') {
        updated.saldoFinale = value;
      }
      return updated;
    });
  };

  const handleSaveToRegister = () => {
    if (!onAddF24Entries) return;

    const erarioAmount = parseFloat(formState.erarioImporto);
    const inpsAmount = parseFloat(formState.inpsImporto);
    const entriesToSave = [];

    if (!isNaN(erarioAmount) && erarioAmount > 0) {
      entriesToSave.push({
        taxCode: formState.erarioCodice,
        amount: erarioAmount,
        date: `${formState.erarioAnno}-06-16`, // Standard deadlines
        description: `Quietanza F24 Erario (Codice Tributo ${formState.erarioCodice})`,
        source: 'PDF_COMPILATO'
      });
    }

    if (!isNaN(inpsAmount) && inpsAmount > 0) {
      entriesToSave.push({
        taxCode: formState.inpsCausale,
        amount: inpsAmount,
        date: `${selectedYear}-06-16`,
        description: `Quietanza F24 INPS (Causale ${formState.inpsCausale})`,
        source: 'PDF_COMPILATO'
      });
    }

    if (entriesToSave.length === 0) {
      alert("Inserisci almeno un importo valido in Sezione Erario o Sezione INPS prima di registrare.");
      return;
    }

    onAddF24Entries(entriesToSave);
    alert(`F24 registrato con successo! Aggiunti ${entriesToSave.length} record contributivi.`);
    
    // Reset file and state
    setFile(null);
    setFileType(null);
    setFormState(prev => ({
      ...prev,
      erarioImporto: '',
      inpsImporto: '',
      saldoFinale: ''
    }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      await loadFile(droppedFile);
    }
  };

  return (
    <div className="bg-theme-card rounded-3xl shadow-sm border border-theme-border p-6 flex flex-col gap-6" id="f24-preview-canvas-overlay">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-base font-extrabold text-theme-text flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            Workspace Revisione Visiva Modello F24
          </h3>
          <p className="text-xs text-theme-text-muted">
            Trascina o carica il tuo Modello F24. Sovrapponiamo i campi di input sopra l'immagine originale per verificare o correggere i dati in tempo reale.
          </p>
        </div>
        
        {file && (
          <button
            onClick={() => {
              setFile(null);
              setFileType(null);
              setStatusMessage('');
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Cancella File
          </button>
        )}
      </div>

      {!file ? (
        // Dropzone Area
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-theme-border/80 hover:border-blue-500/50 bg-slate-50/20 hover:bg-blue-50/5 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer text-center group"
        >
          <div className="p-4 bg-blue-500/10 text-blue-600 rounded-2xl group-hover:scale-105 transition-transform">
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-theme-text">Trascina qui il tuo F24 (PDF o Immagine)</p>
            <p className="text-xs text-theme-text-muted mt-1">Oppure clicca per sfogliare i tuoi file locali</p>
          </div>
          <div className="text-[10px] text-slate-400 bg-slate-100/60 px-3 py-1 rounded-full border border-slate-200/40">
            Formati supportati: PDF, PNG, JPG, JPEG · Fino a 10MB
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* F24 Preview Canvas column */}
          <div className="xl:col-span-8 flex flex-col gap-3">
            <div className="text-xs font-bold text-theme-text-muted uppercase tracking-wider flex items-center justify-between">
              <span>Anteprima Interattiva Documento</span>
              {isRendering && (
                <span className="text-[10px] text-blue-500 flex items-center gap-1 font-medium animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Rendering in corso...
                </span>
              )}
            </div>

            {/* Locked Aspect Ratio A4 Wrapper */}
            <div className="relative w-full aspect-[1/1.414] bg-slate-100 rounded-2xl overflow-hidden shadow-md border border-slate-300">
              {/* HTML5 Render Canvas */}
              <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
              />

              {/* If no image render completed yet, show dummy F24 grid representation as fallback */}
              {!isRendering && (
                <div className="absolute inset-0 pointer-events-none opacity-5 flex flex-col justify-between p-4 font-mono text-[9px] uppercase">
                  <div>Modello F24 - Sfondo Documento</div>
                  <div className="border border-slate-900 flex-1 my-4" />
                  <div>Sezione Riscossione</div>
                </div>
              )}

              {/* Interactive Inputs Layer Overlay (Coordinates perfectly mapped as % of parent width/height) */}
              <div className="absolute inset-0 select-none">
                
                {/* 1. Codice Fiscale Box */}
                <div 
                  className="absolute" 
                  style={{ top: '11.4%', left: '12.5%', width: '32.5%', height: '2.5%' }}
                  title="Codice Fiscale Contribuente"
                >
                  <input
                    type="text"
                    value={formState.fiscalCode}
                    onChange={(e) => handleInputChange('fiscalCode', e.target.value)}
                    className="w-full h-full bg-yellow-100/40 focus:bg-yellow-100 hover:bg-yellow-100/60 border border-amber-500/20 focus:border-amber-500 text-[10px] sm:text-xs font-mono font-bold text-slate-800 px-1 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase"
                  />
                </div>

                {/* 2. Cognome e Nome Box */}
                <div 
                  className="absolute" 
                  style={{ top: '14.8%', left: '12.5%', width: '53.5%', height: '2.5%' }}
                  title="Dati Anagrafici (Cognome e Nome)"
                >
                  <input
                    type="text"
                    value={formState.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    className="w-full h-full bg-yellow-100/40 focus:bg-yellow-100 hover:bg-yellow-100/60 border border-amber-500/20 focus:border-amber-500 text-[10px] sm:text-xs font-mono font-bold text-slate-800 px-1 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase"
                  />
                </div>

                {/* 3. Sezione Erario - Codice Tributo */}
                <div 
                  className="absolute" 
                  style={{ top: '28.2%', left: '27.2%', width: '7.2%', height: '2.2%' }}
                  title="Erario: Codice Tributo (es. 1790, 1791, 1792)"
                >
                  <input
                    type="text"
                    value={formState.erarioCodice}
                    onChange={(e) => handleInputChange('erarioCodice', e.target.value)}
                    className="w-full h-full bg-blue-100/40 focus:bg-blue-100 hover:bg-blue-100/60 border border-blue-500/30 focus:border-blue-500 text-[10px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 4. Sezione Erario - Anno di Riferimento */}
                <div 
                  className="absolute" 
                  style={{ top: '28.2%', left: '54.0%', width: '7.2%', height: '2.2%' }}
                  title="Erario: Anno Riferimento (es. 2026)"
                >
                  <input
                    type="text"
                    value={formState.erarioAnno}
                    onChange={(e) => handleInputChange('erarioAnno', e.target.value)}
                    className="w-full h-full bg-blue-100/40 focus:bg-blue-100 hover:bg-blue-100/60 border border-blue-500/30 focus:border-blue-500 text-[10px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 5. Sezione Erario - Importo a Debito */}
                <div 
                  className="absolute" 
                  style={{ top: '28.2%', left: '63.8%', width: '14.8%', height: '2.2%' }}
                  title="Erario: Importo a Debito Versato"
                >
                  <input
                    type="text"
                    value={formState.erarioImporto}
                    onChange={(e) => handleInputChange('erarioImporto', e.target.value)}
                    placeholder="0.00"
                    className="w-full h-full bg-emerald-100/50 focus:bg-emerald-100 hover:bg-emerald-100/70 border border-emerald-500/30 focus:border-emerald-500 text-[10px] sm:text-xs font-mono font-extrabold text-slate-800 px-1 rounded text-right shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* 6. Sezione INPS - Codice Sede */}
                <div 
                  className="absolute" 
                  style={{ top: '40.2%', left: '4.8%', width: '5.5%', height: '2.2%' }}
                  title="INPS: Codice Sede"
                >
                  <input
                    type="text"
                    value={formState.inpsSede}
                    onChange={(e) => handleInputChange('inpsSede', e.target.value)}
                    className="w-full h-full bg-blue-100/40 focus:bg-blue-100 hover:bg-blue-100/60 border border-blue-500/30 focus:border-blue-500 text-[9px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 7. Sezione INPS - Causale Contributo */}
                <div 
                  className="absolute" 
                  style={{ top: '40.2%', left: '11.2%', width: '6.2%', height: '2.2%' }}
                  title="INPS: Causale Contributo (es. P10)"
                >
                  <input
                    type="text"
                    value={formState.inpsCausale}
                    onChange={(e) => handleInputChange('inpsCausale', e.target.value)}
                    className="w-full h-full bg-blue-100/40 focus:bg-blue-100 hover:bg-blue-100/60 border border-blue-500/30 focus:border-blue-500 text-[9px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                  />
                </div>

                {/* 8. Sezione INPS - Matricola */}
                <div 
                  className="absolute" 
                  style={{ top: '40.2%', left: '21.0%', width: '18.2%', height: '2.2%' }}
                  title="INPS: Codice Matricola / Codice Fiscale"
                >
                  <input
                    type="text"
                    value={formState.inpsMatricola}
                    onChange={(e) => handleInputChange('inpsMatricola', e.target.value)}
                    className="w-full h-full bg-blue-100/40 focus:bg-blue-100 hover:bg-blue-100/60 border border-blue-500/30 focus:border-blue-500 text-[9px] sm:text-xs font-mono font-bold text-slate-800 px-1 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                  />
                </div>

                {/* 9. Sezione INPS - Periodo Da */}
                <div 
                  className="absolute" 
                  style={{ top: '40.2%', left: '40.2%', width: '9.5%', height: '2.2%' }}
                  title="INPS: Periodo Da (MM/AAAA)"
                >
                  <input
                    type="text"
                    value={formState.inpsPeriodoDa}
                    onChange={(e) => handleInputChange('inpsPeriodoDa', e.target.value)}
                    className="w-full h-full bg-blue-100/40 focus:bg-blue-100 hover:bg-blue-100/60 border border-blue-500/30 focus:border-blue-500 text-[9px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 10. Sezione INPS - Periodo A */}
                <div 
                  className="absolute" 
                  style={{ top: '40.2%', left: '50.8%', width: '9.5%', height: '2.2%' }}
                  title="INPS: Periodo A (MM/AAAA)"
                >
                  <input
                    type="text"
                    value={formState.inpsPeriodoA}
                    onChange={(e) => handleInputChange('inpsPeriodoA', e.target.value)}
                    className="w-full h-full bg-blue-100/40 focus:bg-blue-100 hover:bg-blue-100/60 border border-blue-500/30 focus:border-blue-500 text-[9px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 11. Sezione INPS - Importo a Debito */}
                <div 
                  className="absolute" 
                  style={{ top: '40.2%', left: '61.2%', width: '14.8%', height: '2.2%' }}
                  title="INPS: Importo a Debito Versato"
                >
                  <input
                    type="text"
                    value={formState.inpsImporto}
                    onChange={(e) => handleInputChange('inpsImporto', e.target.value)}
                    placeholder="0.00"
                    className="w-full h-full bg-emerald-100/50 focus:bg-emerald-100 hover:bg-emerald-100/70 border border-emerald-500/30 focus:border-emerald-500 text-[10px] sm:text-xs font-mono font-extrabold text-slate-800 px-1 rounded text-right shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* 12. Saldo Finale Euro */}
                <div 
                  className="absolute" 
                  style={{ top: '84.1%', left: '71.5%', width: '23.5%', height: '3.0%' }}
                  title="Saldo Finale F24"
                >
                  <input
                    type="text"
                    value={formState.saldoFinale}
                    onChange={(e) => handleInputChange('saldoFinale', e.target.value)}
                    placeholder="0.00"
                    className="w-full h-full bg-rose-100/60 focus:bg-rose-100 hover:bg-rose-100/80 border border-rose-500/40 focus:border-rose-500 text-xs sm:text-sm font-mono font-black text-rose-800 px-1 rounded text-right shadow-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

              </div>
            </div>
          </div>

          {/* Configuration and verification details sidebar column */}
          <div className="xl:col-span-4 flex flex-col gap-5">
            <div className="bg-slate-50 border border-theme-border/60 rounded-2xl p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-500/10 text-blue-600 rounded-lg">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-theme-text uppercase tracking-wider">Metadati File Caricato</h4>
                  <p className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">{file.name}</p>
                </div>
              </div>

              {statusMessage && (
                <div className="p-3 bg-blue-50/40 border border-blue-200/50 rounded-xl text-blue-700 text-xs flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-blue-500" />
                  <span>{statusMessage}</span>
                </div>
              )}

              <div className="space-y-3 border-t border-slate-200/40 pt-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Verifica i Dati Estratti</div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Contribuente:</span>
                    <span className="font-bold text-slate-800 truncate max-w-[150px]">{formState.fullName}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Codice Fiscale:</span>
                    <span className="font-mono font-bold text-slate-800">{formState.fiscalCode}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Imposta (Erario):</span>
                    <span className="font-mono font-bold text-blue-600">
                      {formState.erarioImporto ? `€ ${parseFloat(formState.erarioImporto).toFixed(2)}` : '€ 0,00'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Contributo (INPS):</span>
                    <span className="font-mono font-bold text-blue-600">
                      {formState.inpsImporto ? `€ ${parseFloat(formState.inpsImporto).toFixed(2)}` : '€ 0,00'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-t border-slate-200/40 pt-2 font-bold">
                    <span className="text-slate-700">Totale addebito:</span>
                    <span className="font-mono text-rose-600 text-sm">
                      {formState.saldoFinale ? `€ ${parseFloat(formState.saldoFinale).toFixed(2)}` : '€ 0,00'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleSaveToRegister}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 text-white" />
                  <span>Conferma e Registra nel Bilancio</span>
                </button>
                <p className="text-[9px] text-center text-slate-400 italic">
                  I contributi confermati verranno inseriti nel calcolo dell'ottimizzatore fiscale come deduzioni.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/40 rounded-2xl">
              <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Come utilizzare questo Workspace</h5>
              <ul className="text-[10px] text-slate-500 space-y-1.5 list-disc pl-3.5">
                <li>I campi sono posizionati esattamente sopra i riquadri corrispondenti del Modello F24.</li>
                <li>Puoi digitare o modificare i valori direttamente sopra l'immagine.</li>
                <li>Le modifiche vengono sincronizzate in tempo reale nei calcoli della simulazione fiscale.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
