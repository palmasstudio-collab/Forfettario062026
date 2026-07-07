/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { BusinessProfile, TaxInput, TaxReturnCalculation, Invoice, F24Entry } from '../types';
import { calculateTaxReturn } from '../calculateTaxReturn';
import { findAtecoCode, findPensionFund } from '../taxData';
import { parseInvoiceXml } from '../utils/xmlInvoiceParser';
import { extractF24DataFromPdf } from '../utils/pdfF24Parser';
import { safeAlert, safeConfirm } from '../utils/safeWindow';
import { 
  Calculator, 
  HelpCircle, 
  ArrowRight, 
  TrendingUp, 
  DollarSign, 
  BookOpen, 
  Clock, 
  Download, 
  FileText,
  Upload,
  Trash2,
  Loader2,
  AlertTriangle,
  ExternalLink,
  FolderOpen,
  Key,
  RefreshCw
} from 'lucide-react';
import { generateTaxAndInvoicePDF } from '../utils/pdfGenerator';
import { generateInvoicePDFDocument } from '../utils/pdfInvoiceBasic';
import { generateF24PDF } from '../utils/f24PdfGenerator';
import F24PreviewCanvas from './F24PreviewCanvas';

export const getMissingInvoiceNumbers = (invoices: Invoice[], year: string): number[] => {
  const seqNos = invoices.map(inv => {
    const withoutYear = inv.number.replace(new RegExp(year, 'g'), '');
    const match = withoutYear.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }).filter((n): n is number => n !== null);
  
  if (seqNos.length === 0) return [];
  
  const maxSeq = Math.max(...seqNos);
  if (maxSeq > 1000) return []; // safety net against format mismatch
  
  const missing = [];
  for (let i = 1; i < maxSeq; i++) {
    if (!seqNos.includes(i)) {
      missing.push(i);
    }
  }
  return missing;
};

interface TaxSimulatorDashboardProps {
  key?: string;
  profile: BusinessProfile;
  revenue: number; // calculated from paid invoices
  invoices: Invoice[];
  allInvoices?: Invoice[];
  googleConnected?: boolean;
  driveFolderId?: string;
  driveFolderUrl?: string;
  f24Files?: { name: string; id: string; url: string; dateAdded: string }[];
  onUploadF24?: (file: File, year?: string) => Promise<void>;
  onUploadF24s?: (files: File[], year?: string) => Promise<any>;
  onDeleteF24?: (id: string) => Promise<void>;
  onConnectGoogle?: () => void;
  hideCalculationsBreakdown?: boolean;
  f24Entries?: F24Entry[];
  allF24Entries?: F24Entry[];
  selectedYear: string;
  onAddInvoice?: (newInvoice: Omit<Invoice, 'id'>) => void;
  onAddInvoices?: (newInvoices: Omit<Invoice, 'id'>[]) => void;
  onDeleteInvoice?: (id: string) => void;
  onAddF24Entries?: (newEntries: any[]) => void;
  onDeleteF24Entry?: (id: string) => void;
  onUploadInvoiceXmlToDrive?: (file: File, year?: string) => Promise<{name: string, id: string, url: string, dateAdded: string}>;
  onSyncDriveInvoices?: () => Promise<void>;
  isSyncingDriveInvoices?: boolean;
  onChangeProfile?: (profile: BusinessProfile) => void;
}

export default function TaxSimulatorDashboard({ 
  profile, 
  revenue, 
  invoices,
  allInvoices = [],
  hideCalculationsBreakdown = false,
  f24Entries = [],
  allF24Entries = [],
  selectedYear,
  onUploadF24,
  onUploadF24s,
  onDeleteF24,
  onConnectGoogle,
  driveFolderId,
  driveFolderUrl,
  f24Files = [],
  googleConnected,
  onAddInvoice,
  onAddInvoices,
  onDeleteInvoice,
  onAddF24Entries,
  onDeleteF24Entry,
  onUploadInvoiceXmlToDrive,
  onSyncDriveInvoices,
  isSyncingDriveInvoices = false,
  onChangeProfile
}: TaxSimulatorDashboardProps) {
  // Calcolo dei contributi inseriti dagli F24 per l'anno selezionato
  const excludedTaxCodes = ['2501', '2524'];
  const autoContributions = f24Entries
    .filter(e => !excludedTaxCodes.includes(e.taxCode))
    .reduce((sum, e) => sum + e.amount, 0);

  const useAutomaticF24 = profile.useAutomaticF24ByYear?.[selectedYear] ?? true;
  const manualContributions = profile.manualContributionsByYear?.[selectedYear] ?? 0;

  const handleUpdateContributions = (val: number) => {
    if (onChangeProfile) {
      const updatedManual = { ...profile.manualContributionsByYear, [selectedYear]: val };
      onChangeProfile({
        ...profile,
        manualContributionsByYear: updatedManual
      });
    }
  };

  const handleToggleAutomatic = (val: boolean) => {
    if (onChangeProfile) {
      const updatedAuto = { ...profile.useAutomaticF24ByYear, [selectedYear]: val };
      onChangeProfile({
        ...profile,
        useAutomaticF24ByYear: updatedAuto
      });
    }
  };

  const [isProcessingXml, setIsProcessingXml] = useState(false);
  const [isProcessingF24, setIsProcessingF24] = useState(false);
  const [showManualF24Form, setShowManualF24Form] = useState(false);
  const [manualF24Data, setManualF24Data] = useState({ date: `${selectedYear}-01-01`, amount: '', code: 'INPS', description: 'Inserimento manuale' });
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const f24InputRef = useRef<HTMLInputElement>(null);

  const prevYearContributions = useAutomaticF24 ? autoContributions : manualContributions;
  
  // Anno di attività (da 1 a 10 per verificare i requisiti dell'aliquota startup al 5%)
  const [yearOfActivity, setYearOfActivity] = useState<number>(1);

  // Modalità di calcolo del fatturato (Cassa / Emesso)
  const [revenueMode, setRevenueMode] = useState<'paid' | 'issued'>(() => {
    return (localStorage.getItem('forfettario_revenue_mode') as 'paid' | 'issued') || 'paid';
  });

  const handleSetRevenueMode = (mode: 'paid' | 'issued') => {
    setRevenueMode(mode);
    localStorage.setItem('forfettario_revenue_mode', mode);
  };

  // Automatically compute and sync year of activity on selectedYear or vatOpeningDate changes
  React.useEffect(() => {
    if (profile.vatOpeningDate && selectedYear) {
      let openingYear = 0;
      if (profile.vatOpeningDate.includes('/')) {
        const parts = profile.vatOpeningDate.split('/');
        if (parts.length === 3) {
          if (parts[2].length === 4) openingYear = parseInt(parts[2], 10);
          else if (parts[0].length === 4) openingYear = parseInt(parts[0], 10);
        }
      } else if (profile.vatOpeningDate.includes('-')) {
        const parts = profile.vatOpeningDate.split('-');
        if (parts.length >= 3) {
          openingYear = parseInt(parts[0], 10);
        }
      }
      if (openingYear > 0) {
        const diff = parseInt(selectedYear, 10) - openingYear + 1;
        setYearOfActivity(Math.max(1, Math.min(10, diff)));
      }
    }
  }, [profile.vatOpeningDate, selectedYear]);

  const handleXmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsProcessingXml(true);
    try {
      const filesArray = Array.from(files) as File[];
      const parsedInvoices: any[] = [];
      const duplicateDetectedList: string[] = [];
      const recentlyAdded = new Set<string>();

      for (const file of filesArray) {
        try {
          const text = await file.text();
          const parsed = parseInvoiceXml(text);
          if (parsed) {
            const duplicateKey = `${parsed.number}-${parsed.clientVat || parsed.clientName}`;
            let isDuplicate = invoices.some(inv => 
               inv.number === parsed.number &&
               (inv.clientVat === parsed.clientVat || inv.clientName === parsed.clientName)
            );

            if (!isDuplicate && recentlyAdded.has(duplicateKey)) {
               isDuplicate = true;
            }

            if (isDuplicate) {
              duplicateDetectedList.push(`N. ${parsed.number} - ${parsed.clientName}`);
            }
            recentlyAdded.add(duplicateKey);
            parsedInvoices.push({ file, parsed });
          }
        } catch (parseErr: any) {
          console.error("Errore di parsing file:", file.name, parseErr);
        }
      }

      if (parsedInvoices.length === 0) {
        safeAlert("Nessuna fattura XML valida trovata nei file selezionati.");
        return;
      }

      let proceedWithUpload = true;
      if (duplicateDetectedList.length > 0) {
        const confirmMsg = `Attenzione: Sono state rilevate ${duplicateDetectedList.length} fatture già caricate o duplicate nel caricamento attuale:\n` +
          duplicateDetectedList.slice(0, 5).map(item => `• ${item}`).join('\n') + 
          (duplicateDetectedList.length > 5 ? `\n• ...e altre ${duplicateDetectedList.length - 5} fatture.` : '') +
          `\n\nVuoi procedere comunque e registrarle tutte?`;
        proceedWithUpload = safeConfirm(confirmMsg);
      }

      if (!proceedWithUpload) {
        safeAlert("Operazione di caricamento massivo annullata.");
        return;
      }

      const invoicesToRegister: Omit<Invoice, 'id'>[] = [];

      for (const { file, parsed } of parsedInvoices) {
        let invoiceDate = parsed.date || `${selectedYear}-01-01`;
        const invoiceYear = invoiceDate ? invoiceDate.split('-')[0] : selectedYear;

        let driveFileId: string | undefined;
        let driveFileUrl: string | undefined;

        if (onUploadInvoiceXmlToDrive) {
          const safeNumber = parsed.number.replace(/[^a-zA-Z0-9]/g, '_');
          const safeDate = invoiceDate.replace(/[^0-9-]/g, '');
          const newNameXML = `Fattura_${safeNumber}_${safeDate}.xml`;
          const renamedFile = new File([file], newNameXML, { type: file.type });
          
          try {
            const uploadedFileResult = await onUploadInvoiceXmlToDrive(renamedFile, invoiceYear);
            driveFileId = uploadedFileResult.id;
            driveFileUrl = uploadedFileResult.url;
            
            try {
               const pdfFile = generateInvoicePDFDocument(parsed, newNameXML);
               await onUploadInvoiceXmlToDrive(pdfFile, invoiceYear);
            } catch (pdfErr) {
               console.warn("Generazione/Upload PDF automatico fallito:", pdfErr);
            }
          } catch (uploadErr: any) {
            console.error("Errore upload file:", file.name, uploadErr);
          }
        }

        invoicesToRegister.push({
          date: invoiceDate,
          number: parsed.number,
          clientName: parsed.clientName,
          clientVat: parsed.clientVat || '',
          hasStampDuty: parsed.hasStampDuty || false,
          amount: parsed.amount,
          isPaid: true,
          notes: parsed.notes,
          driveFileId: driveFileId,
          driveFileUrl: driveFileUrl,
        });
      }

      if (invoicesToRegister.length > 0) {
        if (onAddInvoices) {
          onAddInvoices(invoicesToRegister);
        } else if (onAddInvoice) {
          for (const inv of invoicesToRegister) {
            onAddInvoice(inv);
          }
        }
      }

      safeAlert(`Caricamento massivo completato con successo: ${invoicesToRegister.length} fatture elaborate.`);
    } catch (err: any) {
      safeAlert("Errore elaborazione XML: " + err.message);
    } finally {
      setIsProcessingXml(false);
      if (xmlInputRef.current) xmlInputRef.current.value = '';
    }
  };

  const handleF24Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsProcessingF24(true);
    try {
      const filesArray = Array.from(files) as File[];
      const allTransformedEntries: any[] = [];
      
      if (onUploadF24s) {
        // Use optimized batch uploader on App.tsx which does single structural verify and single state update!
        await onUploadF24s(filesArray, selectedYear);
      } else {
        // Graceful sequential fallback
        for (let i = 0; i < filesArray.length; i++) {
          const file = filesArray[i];
          let documentYear = selectedYear;

          if (onAddF24Entries) {
            try {
              const entries = await extractF24DataFromPdf(file);
              if (entries.length > 0) {
                const foundYear = entries.find(entry => entry.year)?.year;
                if (foundYear) {
                  documentYear = foundYear;
                }

                const transformedEntries = entries.map(entry => {
                  const today = new Date();
                  const monthStr = String(today.getMonth() + 1).padStart(2, '0');
                  const dayStr = String(today.getDate()).padStart(2, '0');
                  const entryYear = entry.year || selectedYear;
                  const entryDate = `${entryYear}-${monthStr}-${dayStr}`;

                  return {
                    taxCode: entry.taxCode,
                    amount: entry.amount,
                    date: entryDate,
                    description: `Quietanza PDF (Codice Tributo ${entry.taxCode})`,
                    source: 'PDF'
                  };
                });
                allTransformedEntries.push(...transformedEntries);
              }
            } catch (errParse) {
              console.warn("F24 parsing error:", errParse);
            }
          }
          if (onUploadF24) {
            await onUploadF24(file, documentYear);
          }
        }

        if (allTransformedEntries.length > 0 && onAddF24Entries) {
          onAddF24Entries(allTransformedEntries);
        }
      }

      safeAlert(`Caricamento massivo F24 completato con successo: ${filesArray.length} file elaborati.`);
    } catch (err: any) {
      safeAlert("Errore elaborazione F24: " + err.message);
    } finally {
      setIsProcessingF24(false);
      if (f24InputRef.current) f24InputRef.current.value = '';
    }
  };

  const handleManualF24Add = () => {
    if (!manualF24Data.amount || isNaN(parseFloat(manualF24Data.amount))) return;
    if (onAddF24Entries) {
      onAddF24Entries([{
        date: manualF24Data.date,
        amount: parseFloat(manualF24Data.amount),
        taxCode: manualF24Data.code,
        source: 'MANUALE'
      }]);
      setManualF24Data({ date: `${selectedYear}-01-01`, amount: '', code: 'INPS', description: 'Inserimento manuale' });
      setShowManualF24Form(false);
    }
  };

  // Costruisce i dati di input per il motore di calcolo
  const totalIssuedInvoicesAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const activeRevenue = revenueMode === 'issued' ? totalIssuedInvoicesAmount : revenue;

  const taxInput: TaxInput = {
    revenue: activeRevenue,
    atecoCode: profile.atecoCode,
    pensionFund: profile.pensionFund,
    contributionsPaidPreviousYear: prevYearContributions,
    isStartup: profile.isStartup,
    yearOfActivity,
    vatOpeningDate: profile.vatOpeningDate,
    calculationYear: parseInt(selectedYear, 10),
    inpsReduction35: profile.inpsReduction35 !== false
  };

  const results: TaxReturnCalculation = calculateTaxReturn(taxInput);
  const selectedAteco = findAtecoCode(profile.atecoCode);
  const selectedFund = findPensionFund(profile.pensionFund);
  
  const missingInvoiceNumbers = getMissingInvoiceNumbers(invoices, selectedYear);

  // Calcolo delle percentuali di impatto
  const taxPercentage = activeRevenue > 0 ? (results.substituteTax / activeRevenue) * 100 : 0;
  const contributionPercentage = activeRevenue > 0 ? (results.currentYearContributions / activeRevenue) * 100 : 0;
  const netPercentage = activeRevenue > 0 ? (results.netIncome / activeRevenue) * 100 : 100;

  const handleGeneratePDFClick = () => {
    const yearToExport = window.prompt("Seleziona l'anno di competenza per la generazione del report:", selectedYear);
    if (!yearToExport) return;

    if (yearToExport === selectedYear) {
       generateTaxAndInvoicePDF(profile, invoices, results, selectedAteco, selectedFund, yearOfActivity, selectedYear, f24Entries, f24Files, missingInvoiceNumbers);
       return;
    }

    const filteredInvoices = allInvoices.filter((inv) => inv.date && inv.date.startsWith(yearToExport));
    const filteredF24 = allF24Entries.filter((e) => e.date && e.date.startsWith(yearToExport));
    const missingForExport = getMissingInvoiceNumbers(filteredInvoices, yearToExport);
    
    const targetRevenue = filteredInvoices.filter(i => i.isPaid).reduce((sum, inv) => sum + inv.amount, 0);
    const targetPrevYearContributions = filteredF24.reduce((sum, e) => {
       if (excludedTaxCodes.includes(e.taxCode)) return sum;
       return sum + e.amount;
    }, 0);

    const targetInput: TaxInput = {
       revenue: targetRevenue,
       atecoCode: profile.atecoCode,
       pensionFund: profile.pensionFund,
       contributionsPaidPreviousYear: targetPrevYearContributions,
       isStartup: profile.isStartup,
       yearOfActivity,
       vatOpeningDate: profile.vatOpeningDate,
       calculationYear: parseInt(yearToExport, 10),
       inpsReduction35: profile.inpsReduction35 !== false
    };
    const targetResults = calculateTaxReturn(targetInput);

    generateTaxAndInvoicePDF(profile, filteredInvoices, targetResults, selectedAteco, selectedFund, yearOfActivity, yearToExport, filteredF24, f24Files, missingForExport);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-theme-text" id="tax-simulator-dashboard">
      
      {/* Barra Azioni Principali: Esportazione PDF */}
      <div className="bg-theme-card rounded-3xl shadow-sm border border-theme-border p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-theme-bg rounded-xl text-theme-text hidden sm:block">
            <FileText className="w-5 h-5 text-theme-text-muted" />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-theme-text">Copia Esportabile del Fascicolo</h4>
            <p className="text-[11px] text-theme-text-muted">Scarica localmente l'intero bilancio fiscale simulato con il registro cronologico delle fatture.</p>
          </div>
        </div>
        <button
          onClick={handleGeneratePDFClick}
          className="bg-theme-accent hover:opacity-90 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm w-full sm:w-auto shrink-0"
          id="btn-export-pdf-main"
        >
          <Download className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
          <span>Esporta Report in PDF</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Colonna Sinistra: Input aggiuntivi e Sintesi Matematica */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        
        {/* Card Input di Simulazione */}
        <div className="bg-theme-card rounded-3xl shadow-sm border border-theme-border p-6 sm:p-8">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-600 animate-pulse">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-theme-text tracking-tight">Parametri Avanzati di Calcolo</h3>
              <p className="text-xs text-theme-text-muted">Regola le deduzioni passive e lo scaglione temporale della tua attività</p>
            </div>
          </div>

          {/* Selettore della Base Imponibile */}
          <div className="mt-6 p-4 bg-theme-bg/60 rounded-2xl border border-theme-border/60">
            <label className="text-xs font-bold text-theme-text-muted uppercase tracking-wider block mb-2.5">
              Base di Calcolo delle Imposte e Contributi
            </label>
            <div className="grid grid-cols-2 gap-2 bg-theme-bg p-1 rounded-xl border border-theme-border/80">
              <button
                type="button"
                onClick={() => handleSetRevenueMode('paid')}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  revenueMode === 'paid'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-theme-text-muted hover:text-theme-text hover:bg-theme-border/40'
                }`}
              >
                Fatturato Incassato (Cassa: € {revenue.toLocaleString('it-IT')})
              </button>
              <button
                type="button"
                onClick={() => handleSetRevenueMode('issued')}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  revenueMode === 'issued'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-theme-text-muted hover:text-theme-text hover:bg-theme-border/40'
                }`}
              >
                Fatturato Emesso (Totale: € {totalIssuedInvoicesAmount.toLocaleString('it-IT')})
              </button>
            </div>
            <p className="text-[10px] text-theme-text-muted mt-2 leading-relaxed">
              {revenueMode === 'paid'
                ? "💡 Stai simulando secondo il Principio di Cassa (regola ufficiale del Regime Forfettario): tasse e contributi si calcolano solo sulle fatture effettivamente incassate."
                : "💡 Stai simulando sul Totale delle Fatture Emesse (anche non incassate): utile per simulare l'impatto fiscale comprensivo dei crediti in corso."}
            </p>
          </div>
 
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
            {/* Contributi Previdenziali Versati nell'anno Corrente */}
            <div className="flex flex-col gap-1.5" id="prev-year-contributions-config">
              <label className="text-xs font-bold text-theme-text-muted uppercase tracking-wider flex items-center justify-between">
                <span>Contributi Dedotti (Principio di Cassa)</span>
                <span className="relative inline-block group">
                  <HelpCircle className="w-3.5 h-3.5 text-theme-text-muted cursor-help" />
                  <span className="pointer-events-none absolute bottom-full mb-1 right-1/2 -translate-x-1/2 w-56 bg-theme-card text-theme-text rounded-lg text-[10px] p-2 leading-relaxed opacity-0 group-hover:opacity-100 transition duration-150 z-20 shadow-xl border border-theme-border">
                    Contributi previdenziali versati o addebitati tramite F24 nell'anno d'imposta selezionato. Vengono sottratti dal reddito imponibile lordo per calcolare la base imponibile netta.
                  </span>
                </span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-theme-text-muted font-semibold text-xs">€</span>
                <input
                  type="number"
                  min="0"
                  disabled={useAutomaticF24}
                  className={`w-full pl-8 pr-4 py-2.5 rounded-xl border border-theme-border focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-semibold transition-all ${
                    useAutomaticF24 
                      ? 'bg-theme-bg text-emerald-600 border-theme-border cursor-not-allowed font-extrabold' 
                      : 'bg-theme-card text-theme-text border-theme-border'
                  }`}
                  value={prevYearContributions}
                  onChange={(e) => handleUpdateContributions(Math.max(0, parseFloat(e.target.value) || 0))}
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => handleToggleAutomatic(!useAutomaticF24)}
                  className={`text-[9.5px] font-bold px-2 py-0.5 rounded-md border transition-all self-start cursor-pointer ${
                    useAutomaticF24 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {useAutomaticF24 ? '✔ Auto (Da F24)' : '✍ Forza Manuale'}
                </button>
                <span className="text-[9.5px] text-slate-500 truncate">
                  {useAutomaticF24 
                    ? `Totale F24 registrati nel ${selectedYear}: €${autoContributions.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : 'Modifica manuale attiva'
                  }
                </span>
              </div>
            </div>
 
            {/* Anno di Attività */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-705 uppercase tracking-wider flex items-center justify-between">
                <span>Anzianità Di Impresa</span>
                <span className="relative inline-block group">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                  <span className="pointer-events-none absolute bottom-full mb-1 right-1/2 -translate-x-1/2 w-52 bg-white text-slate-900 rounded-lg text-[10px] p-2 leading-relaxed opacity-0 group-hover:opacity-100 transition duration-150 z-20 shadow-xl border border-slate-200">
                    L'aliquota sostitutiva startup al 5% si applica per i primi 5 anni dalla costituzione. Dal 6° anno in poi, l'aliquota sale al 15% ordinario.
                  </span>
                </span>
              </label>
              <select
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 text-sm font-medium transition-all bg-white"
                value={yearOfActivity}
                onChange={(e) => setYearOfActivity(parseInt(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((yr) => (
                  <option key={yr} value={yr}>
                    Anno {yr} d'attività {yr <= 5 ? '(5% Startup Agevolata)' : '(15% Ordinario)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
 
        {/* Card Upload F24 e XML Fatture */}
        <div className="bg-theme-card rounded-3xl shadow-sm border border-theme-border p-6 sm:p-8">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="p-3 bg-sky-500/10 rounded-2xl text-sky-600">
              <Upload className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-theme-text tracking-tight">Caricamento Dati Intelligente</h3>
                {driveFolderUrl && (
                  <a 
                    href={driveFolderUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-bg hover:bg-theme-border text-theme-text-muted hover:text-theme-text rounded-xl text-[10px] font-bold transition-all border border-theme-border"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Apri Cartella Drive</span>
                  </a>
                )}
              </div>
              <p className="text-xs text-theme-text-muted">Carica o rimuovi i documenti e monitora il riepilogo in tempo reale</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Colonna Sinistra: Carica XML & Elenco Fatture */}
            <div className="flex flex-col gap-4">
              <div className="border-2 border-dashed border-theme-border rounded-2xl p-6 flex flex-col items-center justify-center relative hover:bg-theme-bg transition-colors min-h-[140px]">
                <input
                  ref={xmlInputRef}
                  type="file"
                  multiple
                  accept=".xml"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed text-[0px]"
                  onChange={handleXmlUpload}
                  disabled={isProcessingXml}
                />
                {isProcessingXml ? (
                  <Loader2 className="w-8 h-8 text-sky-500 animate-spin mb-3" />
                ) : (
                  <FileText className="w-8 h-8 text-sky-550 mb-3 text-slate-400" />
                )}
                <h4 className="text-sm font-bold text-slate-700">Carica Fattura XML</h4>
                <p className="text-[10px] text-slate-500 text-center mt-1">Trascina o clicca per importare file ministeriali XML</p>
              </div>

              {/* Riepilogo Fatture Caricate */}
              <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">Fatture Caricate ({invoices.length})</h4>
                    {googleConnected && onSyncDriveInvoices && (
                      <button 
                        onClick={onSyncDriveInvoices} 
                        disabled={isSyncingDriveInvoices}
                        className="text-slate-400 hover:text-sky-500 disabled:opacity-50 transition-colors"
                        title="Sincronizza fatture con Google Drive"
                      >
                        {isSyncingDriveInvoices ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-900 bg-sky-100/60 px-2 py-0.5 rounded-md">
                    Tot: € {invoices.reduce((sum, inv) => sum + inv.amount, 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                
                {missingInvoiceNumbers.length > 0 && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="text-xs text-red-800">
                      <strong className="block mb-0.5 font-bold">Attenzione, buco di numerazione rilevato.</strong>
                      Mancano le fatture numero: <b>{missingInvoiceNumbers.join(', ')}</b>
                    </div>
                  </div>
                )}
                
                {invoices.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium">
                    Nessuna fattura XML caricata per il {selectedYear}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {invoices.map((inv) => (
                      <div key={inv.id} className="bg-white p-2.5 rounded-xl border border-slate-200/60 flex items-center justify-between text-xs hover:border-slate-300 transition-colors shadow-sm">
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-slate-800 truncate">{inv.clientName}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono flex items-center gap-1.5">
                            <span>N. {inv.number}</span>
                            <span>·</span>
                            <span>{inv.date}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-extrabold text-slate-900">€ {inv.amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          {onDeleteInvoice && (
                            <button
                              type="button"
                              onClick={() => {
                                if (safeConfirm(`Vuoi davvero rimuovere la fattura N. ${inv.number} di ${inv.clientName}?`)) {
                                  onDeleteInvoice(inv.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Elimina"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Colonna Destra: Carica F24 PDF & Elenco F24 */}
            <div className="flex flex-col gap-4">
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center relative hover:bg-slate-50 transition-colors min-h-[140px]">
                <input
                  ref={f24InputRef}
                  type="file"
                  multiple
                  accept=".pdf"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed text-[0px]"
                  onChange={handleF24Upload}
                  disabled={isProcessingF24}
                />
                {isProcessingF24 ? (
                  <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-3" />
                ) : (
                  <BookOpen className="w-8 h-8 text-slate-400 mb-3" />
                )}
                <h4 className="text-sm font-bold text-slate-700">Carica Modello F24 PDF</h4>
                <p className="text-[10px] text-slate-500 text-center mt-1">Trascina o clicca per estrapolare quietanze in PDF</p>
              </div>

              {/* Riepilogo F24 Caricati */}
              <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">F24 Registrati ({f24Entries.length})</h4>
                  <span className="text-xs font-mono font-bold text-slate-900 bg-purple-100/60 px-2 py-0.5 rounded-md">
                    Tot: € {f24Entries.reduce((sum, e) => sum + e.amount, 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {f24Entries.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium">
                    Nessun contributo F24 caricato per il {selectedYear}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {f24Entries.map((e) => (
                      <div key={e.id} className="bg-theme-card p-2.5 rounded-xl border border-theme-border flex items-center justify-between text-xs hover:border-theme-accent/50 transition-colors shadow-sm">
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-theme-text">Tributo {e.taxCode}</div>
                          <div className="text-[10px] text-theme-text-muted mt-0.5 font-mono flex items-center gap-1.5">
                            <span className="font-bold uppercase tracking-wider text-[9px] px-1 py-0.2 bg-theme-bg text-theme-text-muted rounded">{e.source}</span>
                            <span>·</span>
                            <span>{e.date}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-extrabold text-theme-text">€ {e.amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          {onDeleteF24Entry && (
                            <button
                              type="button"
                              onClick={() => {
                                if (safeConfirm(`Vuoi davvero rimuovere questo record F24 (Tributo ${e.taxCode})?`)) {
                                  onDeleteF24Entry(e.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Elimina"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Manual F24 Entry Form */}
                <div className="mt-3">
                  {!showManualF24Form ? (
                    <button
                      type="button"
                      onClick={() => setShowManualF24Form(true)}
                      className="w-full py-2 text-[10px] font-bold text-theme-text-muted bg-theme-bg hover:bg-theme-border border border-dashed border-theme-border hover:text-theme-text rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>+ Inserisci Contributo Manualmente</span>
                    </button>
                  ) : (
                    <div className="bg-theme-card p-3 rounded-xl border border-theme-accent shadow-sm animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-theme-accent uppercase tracking-wider">Nuovo Contributo</span>
                        <button type="button" onClick={() => setShowManualF24Form(false)} className="text-theme-text-muted hover:text-theme-text cursor-pointer text-xs font-bold px-1 py-0.5 border rounded">
                          X
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="text-[9px] font-bold text-theme-text-muted uppercase">Data Versamento</label>
                          <input 
                            type="date" 
                            className="w-full p-1.5 text-xs rounded bg-theme-bg border border-theme-border text-theme-text"
                            value={manualF24Data.date}
                            onChange={e => setManualF24Data({...manualF24Data, date: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 uppercase">Importo (€)</label>
                          <input 
                            type="number" 
                            min="0"
                            className="w-full p-1.5 text-xs rounded bg-slate-50 border border-slate-200 font-mono"
                            placeholder="0.00"
                            value={manualF24Data.amount}
                            onChange={e => setManualF24Data({...manualF24Data, amount: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="mb-2">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Codice Tributo / Cassa</label>
                        <input 
                          type="text" 
                          className="w-full p-1.5 text-xs rounded bg-slate-50 border border-slate-200 font-mono uppercase"
                          placeholder="es. INPS, INARCASSA, 4001"
                          value={manualF24Data.code}
                          onChange={e => setManualF24Data({...manualF24Data, code: e.target.value.toUpperCase()})}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleManualF24Add}
                        disabled={!manualF24Data.amount}
                        className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Aggiungi
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Workspace Revisione Visiva Modello F24 */}
        <F24PreviewCanvas
          profile={profile}
          selectedYear={selectedYear}
          results={results}
          onAddF24Entries={onAddF24Entries}
          f24Files={f24Files}
        />

      </div>
 
      {/* Colonna Destra: Risultato Netto, Grafico e Quadro LM simulato */}
      <div className="flex flex-col gap-6">
        
        {/* Card Risultato Netto - Dark Sleek Container */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-lg relative overflow-hidden border border-slate-800">
          <div className="absolute top-0 right-0 p-8 w-24 h-24 bg-emerald-500/5 rounded-full translate-x-12 -translate-y-12"></div>
          
          <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1.5">Netto Consolidato Stimato</div>
          <div className="text-3xl font-black font-mono tracking-tight text-white mb-2">
            € {results.netIncome.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mb-5 leading-normal">
            Il tuo ricavo effettivo depurato delle tasse e dei contributi calcolati per competenza sull'imponibile.
          </p>
 
          <div className="border-t border-slate-800 pt-4 space-y-3.5 text-sm">
            <div className="flex justify-between text-[11px] text-slate-400 font-bold">
              <span>Ripartizione Fatturato Lordo</span>
              <span>100%</span>
            </div>
            
            {/* Visual Progress Bar Stack */}
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex">
              <div 
                className="bg-emerald-500 h-full rounded-l-full transition-all duration-300" 
                style={{ width: `${netPercentage}%` }} 
                title={`Netto in tasca: ${netPercentage.toFixed(1)}%`}
              />
              <div 
                className="bg-rose-500 h-full transition-all duration-300" 
                style={{ width: `${taxPercentage}%` }} 
                title={`Imposta Sostitutiva: ${taxPercentage.toFixed(1)}%`}
              />
              <div 
                className="bg-blue-500 h-full rounded-r-full transition-all duration-300" 
                style={{ width: `${contributionPercentage}%` }} 
                title={`Contributi: ${contributionPercentage.toFixed(1)}%`}
              />
            </div>
 
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="text-slate-200">Netto Residuo</span>
                </div>
                <span className="font-mono text-emerald-400">{netPercentage.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span>
                  <span className="text-slate-200">Imposta ({results.taxRate * 100}%)</span>
                </div>
                <span className="font-mono text-rose-455 text-rose-400">{taxPercentage.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span>
                  <span className="text-slate-200">Previdenza</span>
                </div>
                <span className="font-mono text-blue-400">{contributionPercentage.toFixed(1)}%</span>
              </div>
            </div>

            {results.netIncome === 0 && activeRevenue > 0 && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[11px] text-rose-300 leading-normal flex gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-rose-200">Nota Contributi Fissi:</span> Il tuo netto stimato è € 0,00 perché la cassa previdenziale ({selectedFund.name}) prevede un contributo fisso annuale minimo obbligatorio di <span className="font-bold text-white">€ {selectedFund.minimumContribution?.toLocaleString('it-IT') || '4.200'}</span>. Questo costo fisso grava sul tuo fatturato superando l'imponibile attuale.
                </div>
              </div>
            )}
          </div>
        </div>
 
        {/* Quadro LM / RR - Agenzia delle Entrate MOCK SIMULATOR */}
        <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4 border-b border-slate-200 pb-3">
            <BookOpen className="w-5 h-5 text-slate-700" />
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Modello Redditi PF</h4>
              <p className="text-[10px] text-slate-400">Certificazione Quadro LM &amp; Quadro RR</p>
            </div>
          </div>
 
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            I valori determinati dall'algoritmo confluiscono direttamente nei seguenti righi ufficiali della dichiarazione dei redditi.
          </p>
 
          <div className="space-y-3.5 font-mono text-xs">
            {/* Quadro LM - Sezione I */}
            <div className="p-3 bg-white rounded-2xl border border-slate-100">
              <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-50 pb-1.5">QUADRO LM - Regime Forfettario</div>
              
              <div className="divide-y divide-slate-50 space-y-1.5">
                <div className="flex justify-between py-1 items-center">
                  <span className="text-[10px] text-slate-500 font-bold">LM22 col. 1 (ATECO)</span>
                  <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40">{profile.atecoCode}</span>
                </div>
                <div className="flex justify-between py-1 items-center">
                  <span className="text-[10px] text-slate-500 font-bold">LM22 col. 2 (Coefficiente)</span>
                  <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40">{(selectedAteco.coefficient * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between py-1 items-center">
                  <span className="text-[10px] text-slate-500 font-bold">LM22 col. 3 (Ricavi)</span>
                  <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40">€ {activeRevenue.toFixed(0)}</span>
                </div>
                <div className="flex justify-between py-1 items-center">
                  <span className="text-[10px] text-slate-500 font-bold">LM34 (Reddito Lordo)</span>
                  <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40">€ {results.grossTaxableIncome.toFixed(0)}</span>
                </div>
                <div className="flex justify-between py-1 items-center">
                  <span className="text-[10px] text-slate-500 font-bold">LM35 (Contributi Dedu.)</span>
                  <span className="font-bold text-emerald-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40">€ {results.deductibleContributions.toFixed(0)}</span>
                </div>
                <div className="flex justify-between py-1 items-center">
                  <span className="text-[10px] text-slate-500 font-bold">LM36 (Reddito Netto)</span>
                  <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40">€ {results.netTaxableIncome.toFixed(0)}</span>
                </div>
                <div className="py-2 border-t border-slate-100">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] text-slate-500 font-bold">LM39 col. 1 (Imposta Sostitutiva)</span>
                    <span className="font-bold text-rose-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40">€ {results.substituteTax.toFixed(2)}</span>
                  </div>
                  {results.substituteTax > 0 ? (
                    <div className="bg-rose-50/40 p-2 rounded-xl border border-rose-200/40 space-y-1.5 mt-1">
                      <div className="text-[8px] font-black text-rose-600 uppercase tracking-wider flex items-center gap-1">
                        <FileText className="w-2.5 h-2.5 text-rose-500" />
                        <span>Genera Modelli F24 Imposta Sostitutiva</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          type="button"
                          onClick={() => generateF24PDF(profile, results.substituteTax, 'imposta', 'saldo', selectedYear)}
                          className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                          title="Genera F24 Saldo"
                        >
                          <span className="text-[7px] text-slate-500 uppercase font-bold">Saldo</span>
                          <span className="font-mono text-[9px]">€ {results.substituteTax.toFixed(0)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => generateF24PDF(profile, results.substituteTax * 0.4, 'imposta', 'acconto1', selectedYear)}
                          className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                          title="Genera F24 1° Acconto (40%)"
                        >
                          <span className="text-[7px] text-slate-500 uppercase font-bold">I° Acc (40%)</span>
                          <span className="font-mono text-[9px]">€ {(results.substituteTax * 0.4).toFixed(0)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => generateF24PDF(profile, results.substituteTax * 0.6, 'imposta', 'acconto2', selectedYear)}
                          className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                          title="Genera F24 2° Acconto (60%)"
                        >
                          <span className="text-[7px] text-slate-500 uppercase font-bold">II° Acc (60%)</span>
                          <span className="font-mono text-[9px]">€ {(results.substituteTax * 0.6).toFixed(0)}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[8.5px] text-slate-400 italic mt-0.5">Nessun importo d'imposta dovuto per la generazione di F24.</div>
                  )}
                </div>
              </div>
            </div>
 
            {/* Quadro RR */}
            <div className="p-3 bg-white rounded-2xl border border-slate-100">
              <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-50 pb-1.5">QUADRO RR - Contributi Previdenziali</div>
              
              <div className="divide-y divide-slate-50 space-y-1.5">
                <div className="flex justify-between py-1 items-center">
                  <span className="text-[10px] text-slate-500 font-bold">Cassa Previdenziale</span>
                  <span className="font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 text-[9px] max-w-[120px] truncate">{selectedFund.name}</span>
                </div>
                
                {results.isSectionI ? (
                  <>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-[10px] text-slate-500 font-bold">RR2 col. 1 (Reddito d'impresa)</span>
                      <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">€ {results.rr2Col1?.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-[10px] text-slate-500 font-bold">RR2 col. 2 (Reddito minimale)</span>
                      <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">€ {results.rr2Col2?.toFixed(0)}</span>
                    </div>
                    <div className="py-2 border-t border-slate-50">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] text-slate-500 font-bold">Contributi IVS sul minimale</span>
                        <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">€ {results.contributiIVSMinimale?.toFixed(2)}</span>
                      </div>
                      {results.contributiIVSMinimale && results.contributiIVSMinimale > 0 ? (
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/40 flex justify-between items-center">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Quota Fissa Trimestrale</span>
                          <button
                            type="button"
                            onClick={() => generateF24PDF(profile, (results.contributiIVSMinimale || 0) / 4, 'contributi', 'minimale', selectedYear, selectedFund.id)}
                            className="p-1 px-2 text-[8px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 border border-blue-200/60 rounded transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                            title="Genera F24 Rata Trimestrale Minimale (1/4 del totale)"
                          >
                            <FileText className="w-3 h-3 text-blue-500" />
                            <span>Genera F24 Rata (€ {((results.contributiIVSMinimale || 0) / 4).toFixed(0)})</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex justify-between py-1 items-center border-t border-slate-50">
                      <span className="text-[10px] text-slate-500 font-bold">Reddito eccedente il minimale</span>
                      <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">
                        {results.redditoEccedenteMinimale && results.redditoEccedenteMinimale > 0 ? `€ ${results.redditoEccedenteMinimale.toFixed(0)}` : '€ 0'}
                      </span>
                    </div>
                    <div className="py-2 border-t border-slate-50">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] text-slate-500 font-bold">Contributi eccedenti il minimale</span>
                        <span className="font-bold text-blue-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">
                          {results.contributiEccedenteMinimale && results.contributiEccedenteMinimale > 0 ? `€ ${results.contributiEccedenteMinimale.toFixed(2)}` : '€ 0,00'}
                        </span>
                      </div>
                      {results.contributiEccedenteMinimale && results.contributiEccedenteMinimale > 0 ? (
                        <div className="bg-blue-50/40 p-2 rounded-xl border border-blue-200/40 space-y-1.5 mt-1">
                          <div className="text-[8px] font-black text-blue-600 uppercase tracking-wider flex items-center gap-1">
                            <FileText className="w-2.5 h-2.5 text-blue-500" />
                            <span>F24 Contributi Eccedenti il Minimale</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            <button
                              type="button"
                              onClick={() => generateF24PDF(profile, results.contributiEccedenteMinimale || 0, 'contributi', 'saldo', selectedYear, selectedFund.id)}
                              className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-blue-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                              title="F24 Saldo eccedenza"
                            >
                              <span className="text-[7px] text-slate-500 uppercase font-bold">Saldo</span>
                              <span className="font-mono text-[9px]">€ {results.contributiEccedenteMinimale.toFixed(0)}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => generateF24PDF(profile, (results.contributiEccedenteMinimale || 0) * 0.4, 'contributi', 'acconto1', selectedYear, selectedFund.id)}
                              className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-blue-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                              title="F24 I° Acconto eccedenza (40%)"
                            >
                              <span className="text-[7px] text-slate-500 uppercase font-bold">I° Acc (40%)</span>
                              <span className="font-mono text-[9px]">€ {(results.contributiEccedenteMinimale * 0.4).toFixed(0)}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => generateF24PDF(profile, (results.contributiEccedenteMinimale || 0) * 0.4, 'contributi', 'acconto2', selectedYear, selectedFund.id)}
                              className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-blue-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                              title="F24 II° Acconto eccedenza (40%)"
                            >
                              <span className="text-[7px] text-slate-500 uppercase font-bold">II° Acc (40%)</span>
                              <span className="font-mono text-[9px]">€ {(results.contributiEccedenteMinimale * 0.4).toFixed(0)}</span>
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : selectedFund.id === 'INPS_GESTIONE_SEPARATA' ? (
                  <>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-[10px] text-slate-500 font-bold">RR Sez. II (Codice Cassa)</span>
                      <span className="font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 text-[9px]">INPS G.S. (Professionisti)</span>
                    </div>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-[10px] text-slate-500 font-bold">Base Imponibile col. 4 (LM34)</span>
                      <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">€ {results.inpsGestioneSeparataBase?.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-[10px] text-slate-500 font-bold">Aliquota Gestione Separata</span>
                      <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">{(results.inpsGestioneSeparataRate ? results.inpsGestioneSeparataRate * 100 : 26.07).toFixed(2)}%</span>
                    </div>
                    <div className="py-2 border-t border-slate-50">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] text-slate-500 font-bold">Contributo Dovuto (col. 5)</span>
                        <span className="font-bold text-blue-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">€ {results.inpsGestioneSeparataDue?.toFixed(2)}</span>
                      </div>
                      {results.inpsGestioneSeparataDue && results.inpsGestioneSeparataDue > 0 ? (
                        <div className="bg-blue-50/40 p-2 rounded-xl border border-blue-200/40 space-y-1.5 mt-1">
                          <div className="text-[8px] font-black text-blue-600 uppercase tracking-wider flex items-center gap-1">
                            <FileText className="w-2.5 h-2.5 text-blue-500" />
                            <span>Genera Modelli F24 Gestione Separata</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            <button
                              type="button"
                              onClick={() => generateF24PDF(profile, results.inpsGestioneSeparataDue || 0, 'contributi', 'saldo', selectedYear, 'INPS_GESTIONE_SEPARATA')}
                              className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-blue-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                              title="Genera F24 Saldo"
                            >
                              <span className="text-[7px] text-slate-500 uppercase font-bold">Saldo</span>
                              <span className="font-mono text-[9px]">€ {results.inpsGestioneSeparataDue.toFixed(0)}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => generateF24PDF(profile, results.inpsGestioneSeparataAcconto1 || 0, 'contributi', 'acconto1', selectedYear, 'INPS_GESTIONE_SEPARATA')}
                              className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-blue-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                              title="Genera F24 I° Acconto (40%)"
                            >
                              <span className="text-[7px] text-slate-500 uppercase font-bold">I° Acc (40%)</span>
                              <span className="font-mono text-[9px]">€ {(results.inpsGestioneSeparataAcconto1 || 0).toFixed(0)}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => generateF24PDF(profile, results.inpsGestioneSeparataAcconto2 || 0, 'contributi', 'acconto2', selectedYear, 'INPS_GESTIONE_SEPARATA')}
                              className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-blue-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                              title="Genera F24 2° Acconto (40%)"
                            >
                              <span className="text-[7px] text-slate-500 uppercase font-bold">II° Acc (40%)</span>
                              <span className="font-mono text-[9px]">€ {(results.inpsGestioneSeparataAcconto2 || 0).toFixed(0)}</span>
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-[10px] text-slate-500 font-bold">Sez. Altri Enti (Cassa)</span>
                      <span className="font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 text-[9px]">{selectedFund.id}</span>
                    </div>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-[10px] text-slate-500 font-bold">Base Imponibile Calcolo</span>
                      <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">€ {results.grossTaxableIncome.toFixed(0)}</span>
                    </div>
                    <div className="py-2 border-t border-slate-50">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] text-slate-500 font-bold">Contributo Dovuto (Stima)</span>
                        <span className="font-bold text-blue-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">€ {results.currentYearContributions.toFixed(2)}</span>
                      </div>
                      {results.currentYearContributions && results.currentYearContributions > 0 ? (
                        <div className="bg-blue-50/40 p-2 rounded-xl border border-blue-200/40 space-y-1.5 mt-1">
                          <div className="text-[8px] font-black text-blue-600 uppercase tracking-wider flex items-center gap-1">
                            <FileText className="w-2.5 h-2.5 text-blue-500" />
                            <span>Genera F24 Cassa {selectedFund.id.replace('_', ' ')}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            <button
                              type="button; "
                              onClick={() => generateF24PDF(profile, results.currentYearContributions, 'contributi', 'saldo', selectedYear, selectedFund.id)}
                              className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-blue-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                              title="Genera F24 Saldo"
                            >
                              <span className="text-[7px] text-slate-500 uppercase font-bold">Saldo</span>
                              <span className="font-mono text-[9px]">€ {results.currentYearContributions.toFixed(0)}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => generateF24PDF(profile, results.currentYearContributions * 0.4, 'contributi', 'acconto1', selectedYear, selectedFund.id)}
                              className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-blue-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                              title="Genera F24 1° Acconto (40%)"
                            >
                              <span className="text-[7px] text-slate-500 uppercase font-bold">I° Acc (40%)</span>
                              <span className="font-mono text-[9px]">€ {(results.currentYearContributions * 0.4).toFixed(0)}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => generateF24PDF(profile, results.currentYearContributions * 0.4, 'contributi', 'acconto2', selectedYear, selectedFund.id)}
                              className="py-1 px-1.5 text-[8px] font-bold bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-800 border border-blue-200/50 rounded transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 shadow-sm"
                              title="Genera F24 2° Acconto (40%)"
                            >
                              <span className="text-[7px] text-slate-500 uppercase font-bold">II° Acc (40%)</span>
                              <span className="font-mono text-[9px]">€ {(results.currentYearContributions * 0.4).toFixed(0)}</span>
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}

                <div className="flex justify-between py-1 items-center border-t border-slate-100">
                  <span className="text-[10px] text-slate-500 font-bold">Totale Contributo Dovuto</span>
                  <span className="font-bold text-blue-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/40 font-mono">€ {results.currentYearContributions.toFixed(2)}</span>
                </div>
              </div>
            </div>
 
          </div>
        </div>
 
      </div>

    </div>
    </div>
  );
}
