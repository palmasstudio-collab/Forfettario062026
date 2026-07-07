/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { 
  Upload, 
  Check, 
  RefreshCw, 
  AlertCircle, 
  FileText, 
  Copy, 
  ExternalLink, 
  Eye, 
  Sparkles, 
  Download, 
  HelpCircle 
} from 'lucide-react';
import { BusinessProfile, TaxReturnCalculation } from '../types';
import { extractF24DataFromPdf } from '../utils/pdfF24Parser';
import { generateF24PDF } from '../utils/f24PdfGenerator';

// Initialize PDFJS Worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
} catch (e) {
  console.warn("Failed to set PDF worker path:", e);
}

interface F24PreviewCanvasProps {
  profile: BusinessProfile;
  selectedYear: string;
  results?: TaxReturnCalculation;
  onAddF24Entries?: (entries: any[]) => void;
  f24Files?: { name: string; id: string; url: string; dateAdded: string }[];
}

export default function F24PreviewCanvas({
  profile,
  selectedYear,
  results,
  onAddF24Entries,
  f24Files = []
}: F24PreviewCanvasProps) {
  // Navigation: 'assisted' (Compilazione Assistita) or 'visual' (Revisione Visiva da File)
  const [activeTab, setActiveTab] = useState<'assisted' | 'visual'>('assisted');
  
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'pdf' | 'image' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  // Field copy states for instant visual feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  // Sync profile data and calculated results when props change
  useEffect(() => {
    const isGestioneSeparata = profile.pensionFund === 'INPS_GESTIONE_SEPARATA';
    const isArtigianiCommercianti = profile.pensionFund === 'INPS_ARTIGIANI' || profile.pensionFund === 'INPS_COMMERCIANTI';
    
    const calculatedSubstituteTax = results?.substituteTax ? results.substituteTax.toFixed(2) : '';
    const calculatedInps = results?.currentYearContributions ? results.currentYearContributions.toFixed(2) : '';
    
    setFormState(prev => {
      // Prioritize pre-existing manually inputted/ocr-extracted imports if present
      const newErarioImporto = prev.erarioImporto || calculatedSubstituteTax;
      const newInpsImporto = prev.inpsImporto || calculatedInps;
      
      const erarioNum = parseFloat(newErarioImporto) || 0;
      const inpsNum = parseFloat(newInpsImporto) || 0;
      const totalBalance = (erarioNum + inpsNum).toFixed(2);
      
      return {
        ...prev,
        fiscalCode: profile.fiscalCode || prev.fiscalCode,
        fullName: profile.fullName || prev.fullName,
        erarioAnno: selectedYear,
        erarioImporto: newErarioImporto,
        inpsPeriodoDa: `01${selectedYear}`,
        inpsPeriodoA: `12${selectedYear}`,
        inpsImporto: newInpsImporto,
        inpsCausale: isGestioneSeparata ? 'P10' : (isArtigianiCommercianti ? 'AP' : prev.inpsCausale),
        saldoFinale: totalBalance !== '0.00' ? totalBalance : prev.saldoFinale
      };
    });
  }, [profile, selectedYear, results]);

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
      
      // Auto-switch to visual tab once a file is uploaded
      setActiveTab('visual');
    } catch (err) {
      console.error(err);
      setStatusMessage('File caricato con avvisi durante l\'estrazione automatica.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Render PDF / Image onto the HTML5 Canvas
  useEffect(() => {
    if (!file || !canvasRef.current || activeTab !== 'visual') return;
    
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
  }, [file, fileType, activeTab]);

  const handleInputChange = (field: string, value: string) => {
    setFormState(prev => {
      const updated = { ...prev, [field]: value };
      
      // Calculate total balance on input changes
      const erarioNum = parseFloat(updated.erarioImporto) || 0;
      const inpsNum = parseFloat(updated.inpsImporto) || 0;
      updated.saldoFinale = (erarioNum + inpsNum).toFixed(2);
      
      return updated;
    });
  };

  const handleCopyToClipboard = (fieldKey: string, textToCopy: string) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedField(fieldKey);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const handleDownloadSystemF24 = (type: 'imposta' | 'contributi') => {
    const isGestioneSeparata = profile.pensionFund === 'INPS_GESTIONE_SEPARATA';
    const fundId = isGestioneSeparata ? 'INPS_GESTIONE_SEPARATA' : profile.pensionFund;
    
    if (type === 'imposta') {
      const amount = parseFloat(formState.erarioImporto) || results?.substituteTax || 0;
      generateF24PDF(profile, amount, 'imposta', 'saldo', selectedYear);
    } else {
      const amount = parseFloat(formState.inpsImporto) || results?.currentYearContributions || 0;
      generateF24PDF(profile, amount, 'contributi', 'saldo', selectedYear, fundId);
    }
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
        date: `${formState.erarioAnno}-06-16`,
        description: `Quietanza F24 Erario (Codice Tributo ${formState.erarioCodice})`,
        source: 'PRE_COMPILATO'
      });
    }

    if (!isNaN(inpsAmount) && inpsAmount > 0) {
      entriesToSave.push({
        taxCode: formState.inpsCausale,
        amount: inpsAmount,
        date: `${selectedYear}-06-16`,
        description: `Quietanza F24 INPS (Causale ${formState.inpsCausale})`,
        source: 'PRE_COMPILATO'
      });
    }

    if (entriesToSave.length === 0) {
      alert("Inserisci almeno un importo valido in Sezione Erario o Sezione INPS prima di registrare.");
      return;
    }

    onAddF24Entries(entriesToSave);
    alert(`F24 registrato con successo nel bilancio simulato! Aggiunti ${entriesToSave.length} record.`);
    
    // Reset inputs
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

  // External compiler official URL
  const externalF24Url = "https://www.amministrazionicomunali.it/modello_f24/modello_f24_online.php";

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-7 flex flex-col gap-6" id="f24-preview-canvas-overlay">
      
      {/* Header section with tabs and info */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 pb-5">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
            Workspace Compilazione & Revisione F24
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Compila il tuo F24 in automatico con i dati simulati del gestionale o effettua la revisione di un documento scansionato.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('assisted')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeTab === 'assisted'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Compilazione Assistita (F24 Online)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('visual')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeTab === 'visual'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Revisione Visiva da File
          </button>
        </div>
      </div>

      {activeTab === 'assisted' ? (
        /* ASSISTED COMPILATION MODE (COPIER INTERFACE MATCHING AMMINISTRAZIONI COMUNALI) */
        <div className="space-y-6">
          {/* Top Banner Guide */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 border border-indigo-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2 text-indigo-300 font-extrabold text-xs tracking-wider uppercase">
                <Sparkles className="w-4 h-4 animate-spin-slow text-indigo-400" />
                <span>Integrazione Automatica Amministrazioni Comunali</span>
              </div>
              <p className="text-sm font-bold text-white leading-relaxed">
                Compila l'F24 sul sito esterno Amministrazioni Comunali utilizzando i dati pronti del tuo gestionale.
              </p>
              <p className="text-xs text-slate-300 leading-normal">
                I parametri fiscali ed i contributi previdenziali del tuo regime forfettario sono pre-calcolati per l'anno <strong>{selectedYear}</strong>. Copiali con un click e incollali sul form online ufficiale per completare la compilazione senza errori.
              </p>
            </div>
            
            <a 
              href={externalF24Url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer shrink-0 border border-indigo-500/30"
            >
              <span>Apri F24 Online</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Main Form Fields Copier Column */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Sezione 1: Contribuente */}
              <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    1. Dati Contribuente
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Amministrazioni Comunali · Sez. Contribuente</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Codice Fiscale Field */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Codice Fiscale</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-bold text-slate-800 text-xs flex-1 truncate">{formState.fiscalCode || 'Non impostato'}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('fiscalCode', formState.fiscalCode)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'fiscalCode'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia codice fiscale"
                      >
                        {copiedField === 'fiscalCode' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Nome e Cognome */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cognome e Nome</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-bold text-slate-800 text-xs flex-1 truncate uppercase">{formState.fullName || 'Non impostato'}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('fullName', formState.fullName)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'fullName'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia nome e cognome"
                      >
                        {copiedField === 'fullName' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sezione 2: Erario */}
              <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    2. Sezione Erario (Imposta Sostitutiva)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 font-bold text-indigo-600">PRE-CALCOLATO</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Codice Tributo */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Codice Tributo</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-bold text-slate-800 text-xs flex-1 text-center bg-slate-50 py-0.5 rounded border border-slate-100">{formState.erarioCodice}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('erarioCodice', formState.erarioCodice)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'erarioCodice'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia codice tributo"
                      >
                        {copiedField === 'erarioCodice' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Anno di Riferimento */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Anno di Riferimento</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-bold text-slate-800 text-xs flex-1 text-center bg-slate-50 py-0.5 rounded border border-slate-100">{formState.erarioAnno}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('erarioAnno', formState.erarioAnno)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'erarioAnno'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia anno"
                      >
                        {copiedField === 'erarioAnno' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Importo a Debito */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Importo a Debito (€)</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-black text-indigo-600 text-xs flex-1 text-right">
                        {formState.erarioImporto ? parseFloat(formState.erarioImporto).toFixed(2) : '0.00'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('erarioImporto', formState.erarioImporto)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'erarioImporto'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia importo"
                      >
                        {copiedField === 'erarioImporto' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2 gap-2">
                  <span className="text-[10px] text-slate-400">Codici standard acconto: 1790 (Primo acconto) · 1791 (Secondo acconto) · 1792 (Saldo imposta)</span>
                  <button
                    type="button"
                    onClick={() => handleDownloadSystemF24('imposta')}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg transition-all border border-indigo-100"
                  >
                    <Download className="w-3 h-3" />
                    Scarica F24 Erario Completo
                  </button>
                </div>
              </div>

              {/* Sezione 3: INPS */}
              <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    3. Sezione INPS (Contributi Previdenziali)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 font-bold text-indigo-600 font-semibold">PRE-CALCOLATO</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Codice Sede */}
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Codice Sede INPS</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-bold text-slate-800 text-xs flex-1 text-center bg-slate-50 py-0.5 rounded border border-slate-100">{formState.inpsSede}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('inpsSede', formState.inpsSede)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'inpsSede'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia codice sede"
                      >
                        {copiedField === 'inpsSede' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Causale Contributo */}
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Causale Contributo</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-bold text-slate-800 text-xs flex-1 text-center bg-slate-50 py-0.5 rounded border border-slate-100">{formState.inpsCausale}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('inpsCausale', formState.inpsCausale)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'inpsCausale'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia causale"
                      >
                        {copiedField === 'inpsCausale' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Matricola o CF */}
                  <div className="space-y-1 md:col-span-6">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Codice Matricola / Codice Fiscale</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-bold text-slate-800 text-xs flex-1 truncate uppercase">{formState.inpsMatricola}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('inpsMatricola', formState.inpsMatricola)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'inpsMatricola'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia matricola"
                      >
                        {copiedField === 'inpsMatricola' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Periodo Da */}
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Periodo Da (MM/AAAA)</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-bold text-slate-800 text-xs flex-1 text-center">{formState.inpsPeriodoDa}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('inpsPeriodoDa', formState.inpsPeriodoDa)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'inpsPeriodoDa'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia data inizio"
                      >
                        {copiedField === 'inpsPeriodoDa' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Periodo A */}
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Periodo A (MM/AAAA)</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-bold text-slate-800 text-xs flex-1 text-center">{formState.inpsPeriodoA}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('inpsPeriodoA', formState.inpsPeriodoA)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'inpsPeriodoA'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia data fine"
                      >
                        {copiedField === 'inpsPeriodoA' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Importo INPS */}
                  <div className="space-y-1 md:col-span-6">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Importo Contributi a Debito (€)</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-black text-indigo-600 text-xs flex-1 text-right">
                        {formState.inpsImporto ? parseFloat(formState.inpsImporto).toFixed(2) : '0.00'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('inpsImporto', formState.inpsImporto)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'inpsImporto'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia importo INPS"
                      >
                        {copiedField === 'inpsImporto' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2 gap-2">
                  <span className="text-[10px] text-slate-400">Causali comuni: P10 (Gestione Separata) · AP (Artigiani minimale) · CP (Commercianti minimale)</span>
                  <button
                    type="button"
                    onClick={() => handleDownloadSystemF24('contributi')}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg transition-all border border-indigo-100"
                  >
                    <Download className="w-3 h-3" />
                    Scarica F24 INPS Completo
                  </button>
                </div>
              </div>

            </div>

            {/* Sidebar with Actions and Totals */}
            <div className="lg:col-span-4 space-y-5">
              
              {/* Summary Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-lg space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Riepilogo Totale F24</h4>
                
                <div className="space-y-2 border-b border-slate-800 pb-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Quota Imposta:</span>
                    <span className="font-mono font-bold text-slate-200">
                      {formState.erarioImporto ? `€ ${parseFloat(formState.erarioImporto).toLocaleString('it-IT', {minimumFractionDigits: 2})}` : '€ 0,00'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Quota INPS / Contributi:</span>
                    <span className="font-mono font-bold text-slate-200">
                      {formState.inpsImporto ? `€ ${parseFloat(formState.inpsImporto).toLocaleString('it-IT', {minimumFractionDigits: 2})}` : '€ 0,00'}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-300">Totale F24:</span>
                  <span className="text-xl font-mono font-black text-emerald-400">
                    {formState.saldoFinale ? `€ ${parseFloat(formState.saldoFinale).toLocaleString('it-IT', {minimumFractionDigits: 2})}` : '€ 0,00'}
                  </span>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveToRegister}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md shadow-emerald-950 flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4 text-white" />
                    <span>Salva come Pagato nel Bilancio</span>
                  </button>
                  <p className="text-[10px] text-center text-slate-400">
                    Registra questo pagamento per dedurlo dai calcoli e aggiornare lo stato del simulatore fiscale.
                  </p>
                </div>
              </div>

              {/* Instructions Panel */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <HelpCircle className="w-4 h-4 text-indigo-500" />
                  <span>Istruzioni Rapide</span>
                </div>
                <ol className="text-[11px] text-slate-600 space-y-2 list-decimal pl-4">
                  <li>Clicca sul pulsante <strong>"Apri F24 Online"</strong> in alto per caricare il form di Amministrazioni Comunali.</li>
                  <li>Per ciascun riquadro, premi l'icona <Copy className="w-3 h-3 inline text-slate-400 mx-0.5" /> per copiare il dato pronto dal gestionale.</li>
                  <li>Incolla i dati nel campo corrispondente sulla pagina online.</li>
                  <li>Una volta pagato, premi <strong>"Salva come Pagato"</strong> per aggiornare la tua contabilità nel gestionale.</li>
                </ol>
              </div>

            </div>

          </div>
        </div>
      ) : (
        /* VISUAL REVISION MODE (ORIGINAL PDF/IMAGE CANVAS INTERACTIVE) */
        <div className="space-y-5 animate-fade-in">
          
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Caricamento Visivo e Allineamento Coordinate</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Carica un PDF compilato o un'immagine di un F24. Puoi modificare i dati posizionati visivamente sopra le caselle fisiche per correggere gli importi estratti.
              </p>
            </div>
            
            {file && (
              <button
                onClick={() => {
                  setFile(null);
                  setFileType(null);
                  setStatusMessage('');
                }}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cancella File
              </button>
            )}
          </div>

          {!file ? (
            /* Dropzone Area */
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-indigo-500/50 bg-slate-50/50 hover:bg-indigo-50/10 rounded-2xl p-12 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer text-center group"
            >
              <div className="p-4 bg-indigo-500/10 text-indigo-600 rounded-2xl group-hover:scale-105 transition-transform">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Trascina qui il tuo modello F24 (PDF o Immagine)</p>
                <p className="text-xs text-slate-400 mt-1">Oppure clicca per sfogliare i tuoi file locali</p>
              </div>
              <div className="text-[10px] text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200">
                Supportati: PDF, PNG, JPG · Fino a 10MB
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
              
              {/* Interactive F24 Canvas Overlay Box */}
              <div className="xl:col-span-8 flex flex-col gap-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Modello F24 - Sfondo Interattivo</span>
                  {isRendering && (
                    <span className="text-[10px] text-indigo-600 flex items-center gap-1 font-medium animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Rendering in corso...
                    </span>
                  )}
                </div>

                <div className="relative w-full aspect-[1/1.414] bg-slate-100 rounded-2xl overflow-hidden shadow-md border border-slate-300">
                  <canvas ref={canvasRef} className="w-full h-full object-contain" />

                  {/* Positioning Overlay inputs */}
                  <div className="absolute inset-0 select-none">
                    
                    {/* 1. Codice Fiscale */}
                    <div className="absolute" style={{ top: '11.4%', left: '12.5%', width: '32.5%', height: '2.5%' }}>
                      <input
                        type="text"
                        value={formState.fiscalCode}
                        onChange={(e) => handleInputChange('fiscalCode', e.target.value)}
                        className="w-full h-full bg-yellow-100/40 focus:bg-yellow-100/90 border border-amber-500/30 text-[10px] sm:text-xs font-mono font-bold text-slate-800 px-1 rounded shadow-sm focus:outline-none uppercase"
                        title="Codice Fiscale"
                      />
                    </div>

                    {/* 2. Cognome e Nome */}
                    <div className="absolute" style={{ top: '14.8%', left: '12.5%', width: '53.5%', height: '2.5%' }}>
                      <input
                        type="text"
                        value={formState.fullName}
                        onChange={(e) => handleInputChange('fullName', e.target.value)}
                        className="w-full h-full bg-yellow-100/40 focus:bg-yellow-100/90 border border-amber-500/30 text-[10px] sm:text-xs font-mono font-bold text-slate-800 px-1 rounded shadow-sm focus:outline-none uppercase"
                        title="Cognome e Nome"
                      />
                    </div>

                    {/* 3. Sezione Erario - Codice Tributo */}
                    <div className="absolute" style={{ top: '28.2%', left: '27.2%', width: '7.2%', height: '2.2%' }}>
                      <input
                        type="text"
                        value={formState.erarioCodice}
                        onChange={(e) => handleInputChange('erarioCodice', e.target.value)}
                        className="w-full h-full bg-indigo-100/40 focus:bg-indigo-100/90 border border-indigo-500/30 text-[10px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none"
                      />
                    </div>

                    {/* 4. Sezione Erario - Anno */}
                    <div className="absolute" style={{ top: '28.2%', left: '54.0%', width: '7.2%', height: '2.2%' }}>
                      <input
                        type="text"
                        value={formState.erarioAnno}
                        onChange={(e) => handleInputChange('erarioAnno', e.target.value)}
                        className="w-full h-full bg-indigo-100/40 focus:bg-indigo-100/90 border border-indigo-500/30 text-[10px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none"
                      />
                    </div>

                    {/* 5. Sezione Erario - Importo */}
                    <div className="absolute" style={{ top: '28.2%', left: '63.8%', width: '14.8%', height: '2.2%' }}>
                      <input
                        type="text"
                        value={formState.erarioImporto}
                        onChange={(e) => handleInputChange('erarioImporto', e.target.value)}
                        placeholder="0.00"
                        className="w-full h-full bg-emerald-100/50 focus:bg-emerald-100/90 border border-emerald-500/30 text-[10px] sm:text-xs font-mono font-extrabold text-slate-850 px-1 rounded text-right shadow-sm focus:outline-none"
                      />
                    </div>

                    {/* 6. INPS - Sede */}
                    <div className="absolute" style={{ top: '40.2%', left: '4.8%', width: '5.5%', height: '2.2%' }}>
                      <input
                        type="text"
                        value={formState.inpsSede}
                        onChange={(e) => handleInputChange('inpsSede', e.target.value)}
                        className="w-full h-full bg-indigo-100/40 focus:bg-indigo-100/90 border border-indigo-500/30 text-[9px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none"
                      />
                    </div>

                    {/* 7. INPS - Causale */}
                    <div className="absolute" style={{ top: '40.2%', left: '11.2%', width: '6.2%', height: '2.2%' }}>
                      <input
                        type="text"
                        value={formState.inpsCausale}
                        onChange={(e) => handleInputChange('inpsCausale', e.target.value)}
                        className="w-full h-full bg-indigo-100/40 focus:bg-indigo-100/90 border border-indigo-500/30 text-[9px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none uppercase"
                      />
                    </div>

                    {/* 8. INPS - Matricola */}
                    <div className="absolute" style={{ top: '40.2%', left: '21.0%', width: '18.2%', height: '2.2%' }}>
                      <input
                        type="text"
                        value={formState.inpsMatricola}
                        onChange={(e) => handleInputChange('inpsMatricola', e.target.value)}
                        className="w-full h-full bg-indigo-100/40 focus:bg-indigo-100/90 border border-indigo-500/30 text-[9px] sm:text-xs font-mono font-bold text-slate-800 px-1 rounded shadow-sm focus:outline-none uppercase"
                      />
                    </div>

                    {/* 9. INPS - Periodo Da */}
                    <div className="absolute" style={{ top: '40.2%', left: '40.2%', width: '9.5%', height: '2.2%' }}>
                      <input
                        type="text"
                        value={formState.inpsPeriodoDa}
                        onChange={(e) => handleInputChange('inpsPeriodoDa', e.target.value)}
                        className="w-full h-full bg-indigo-100/40 focus:bg-indigo-100/90 border border-indigo-500/30 text-[9px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none"
                      />
                    </div>

                    {/* 10. INPS - Periodo A */}
                    <div className="absolute" style={{ top: '40.2%', left: '50.8%', width: '9.5%', height: '2.2%' }}>
                      <input
                        type="text"
                        value={formState.inpsPeriodoA}
                        onChange={(e) => handleInputChange('inpsPeriodoA', e.target.value)}
                        className="w-full h-full bg-indigo-100/40 focus:bg-indigo-100/90 border border-indigo-500/30 text-[9px] sm:text-xs font-mono font-bold text-slate-800 px-0.5 rounded text-center shadow-sm focus:outline-none"
                      />
                    </div>

                    {/* 11. INPS - Importo */}
                    <div className="absolute" style={{ top: '40.2%', left: '61.2%', width: '14.8%', height: '2.2%' }}>
                      <input
                        type="text"
                        value={formState.inpsImporto}
                        onChange={(e) => handleInputChange('inpsImporto', e.target.value)}
                        placeholder="0.00"
                        className="w-full h-full bg-emerald-100/50 focus:bg-emerald-100/90 border border-emerald-500/30 text-[10px] sm:text-xs font-mono font-extrabold text-slate-800 px-1 rounded text-right shadow-sm focus:outline-none"
                      />
                    </div>

                    {/* 12. Saldo Finale */}
                    <div className="absolute" style={{ top: '84.1%', left: '71.5%', width: '23.5%', height: '3.0%' }}>
                      <input
                        type="text"
                        value={formState.saldoFinale}
                        onChange={(e) => handleInputChange('saldoFinale', e.target.value)}
                        placeholder="0.00"
                        className="w-full h-full bg-rose-100/70 focus:bg-rose-100/90 border border-rose-500/40 text-xs sm:text-sm font-mono font-black text-rose-800 px-1 rounded text-right shadow-sm focus:outline-none"
                      />
                    </div>

                  </div>
                </div>
              </div>

              {/* Sidebar with Metadata and Sync button */}
              <div className="xl:col-span-4 flex flex-col gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase">File Caricato</h4>
                      <p className="text-[10px] font-mono text-slate-400 truncate max-w-[200px]">{file.name}</p>
                    </div>
                  </div>

                  {statusMessage && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-xs flex gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-blue-500" />
                      <span>{statusMessage}</span>
                    </div>
                  )}

                  <div className="space-y-2 border-t border-slate-200 pt-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Verifica Valori Estratti</div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Contribuente:</span>
                      <span className="font-bold text-slate-800 truncate max-w-[150px]">{formState.fullName}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Erario:</span>
                      <span className="font-mono font-bold text-indigo-600">€ {parseFloat(formState.erarioImporto || '0').toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">INPS:</span>
                      <span className="font-mono font-bold text-indigo-600">€ {parseFloat(formState.inpsImporto || '0').toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs border-t border-slate-200 pt-2 font-bold">
                      <span className="text-slate-700">Totale F24:</span>
                      <span className="font-mono text-rose-600">€ {parseFloat(formState.saldoFinale || '0').toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveToRegister}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4 text-white" />
                    <span>Conferma e Registra nel Bilancio</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
}
