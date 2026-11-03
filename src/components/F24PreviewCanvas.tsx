/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  HelpCircle,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  Calculator,
  Clock,
  ArrowRight,
  Info
} from 'lucide-react';
import { BusinessProfile, TaxReturnCalculation } from '../types';
import { extractF24DataFromPdf } from '../utils/pdfF24Parser';
import { generateF24PDF, generateRavvedimentoF24PDF } from '../utils/f24PdfGenerator';

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
  defaultTab?: 'assisted' | 'ravvedimento' | 'visual';
}

export type SchedulePreset = 'june_saldo' | 'june_acconto1' | 'june_both' | 'july_surcharge' | 'nov_acconto2';

export default function F24PreviewCanvas({
  profile,
  selectedYear,
  results,
  onAddF24Entries,
  f24Files = [],
  defaultTab = 'assisted'
}: F24PreviewCanvasProps) {
  // Navigation tabs:
  // - assisted: Compilazione Assistita con Scadenze Ordinarie (30 Giugno / 30 Luglio / 30 Novembre)
  // - ravvedimento: Calcolatore Ravvedimento Operoso (art. 13 D.Lgs. 472/97)
  // - visual: Revisione Visiva da File PDF/Immagine
  const [activeTab, setActiveTab] = useState<'assisted' | 'ravvedimento' | 'visual'>(defaultTab);

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);
  
  // Schedule preset in assisted mode
  const [selectedSchedule, setSelectedSchedule] = useState<SchedulePreset>('june_both');
  
  // Rateizzazione (1 to 8 installments for June/July, strictly 1 for November)
  const [installmentsCount, setInstallmentsCount] = useState<number>(1);
  const [currentInstallmentIndex, setCurrentInstallmentIndex] = useState<number>(1);

  // INPS Causale: PXX (professionisti senza altra cassa e non pensionati) or P10 (con altra cassa/pensione)
  const [inpsCausaleChoice, setInpsCausaleChoice] = useState<'PXX' | 'P10'>('PXX');

  // File upload state for visual revision
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'pdf' | 'image' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [extractedF24Entries, setExtractedF24Entries] = useState<any[]>([]);
  
  // Field copy states
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // F24 Form values (coordinates and inputs)
  const [formState, setFormState] = useState({
    fiscalCode: profile.fiscalCode || profile.vatNumber || '',
    fullName: profile.fullName || '',
    // Erario
    erarioCodice: '1792',
    erarioRateazione: '0101',
    erarioAnno: selectedYear,
    erarioImporto: '',
    // INPS
    inpsSede: '8200',
    inpsCausale: 'PXX',
    inpsMatricola: profile.fiscalCode || profile.vatNumber || '',
    inpsPeriodoDa: `01${selectedYear}`,
    inpsPeriodoA: `12${selectedYear}`,
    inpsImporto: '',
    // Totale
    saldoFinale: ''
  });

  // Ravvedimento Operoso Calculator state
  const currentYearNum = parseInt(selectedYear, 10);
  const [ravvTributoType, setRavvTributoType] = useState<'1792' | '1790' | '1791' | 'INPS_GS'>('1792');
  const [ravvCustomAmount, setRavvCustomAmount] = useState<string>('');
  const [ravvOriginalDueDate, setRavvOriginalDueDate] = useState<string>(`${currentYearNum + 1}-06-30`);
  const [ravvPaymentDate, setRavvPaymentDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [ravvLegalRate, setRavvLegalRate] = useState<number>(2.50); // Official legal annual interest rate
  const [ravvIncludeTardiva, setRavvIncludeTardiva] = useState<boolean>(false); // 25 € cod. 8911 dichiarazione tardiva

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate base amounts from results
  const substituteTaxSaldo = results?.substituteTaxSaldo ?? results?.substituteTax ?? 0;
  const substituteTaxAcconto1 = results?.substituteTaxAcconto1 ?? (substituteTaxSaldo >= 257.52 ? substituteTaxSaldo * 0.50 : 0);
  const substituteTaxAcconto2 = results?.substituteTaxAcconto2 ?? (substituteTaxSaldo >= 257.52 ? substituteTaxSaldo * 0.50 : (substituteTaxSaldo > 51.65 ? substituteTaxSaldo : 0));
  
  const inpsDue = results?.inpsGestioneSeparataDue ?? results?.currentYearContributions ?? 0;
  const inpsAcconto1 = results?.inpsGestioneSeparataAcconto1 ?? (inpsDue * 0.40);
  const inpsAcconto2 = results?.inpsGestioneSeparataAcconto2 ?? (inpsDue * 0.60);

  // Compute active amounts according to selected schedule preset
  const scheduleCalculations = useMemo(() => {
    let erarioCodice = '1792';
    let erarioAnno = selectedYear;
    let erarioBaseAmount = 0;
    let inpsBaseAmount = 0;
    let surchargeMultiplier = 1.0;
    let dueDateFormatted = `30/06/${currentYearNum + 1}`;
    let isRateizzabile = true;

    switch (selectedSchedule) {
      case 'june_saldo':
        erarioCodice = '1792'; // Saldo anno precedente
        erarioAnno = selectedYear;
        erarioBaseAmount = substituteTaxSaldo;
        inpsBaseAmount = inpsDue;
        dueDateFormatted = `30/06/${currentYearNum + 1}`;
        isRateizzabile = true;
        break;

      case 'june_acconto1':
        erarioCodice = '1790'; // 1° Acconto anno in corso
        erarioAnno = String(currentYearNum + 1);
        erarioBaseAmount = substituteTaxAcconto1;
        inpsBaseAmount = inpsAcconto1;
        dueDateFormatted = `30/06/${currentYearNum + 1}`;
        isRateizzabile = true;
        break;

      case 'june_both':
        erarioCodice = '1792'; // Mostra saldo come riferimento principale (cumulabile con rigo 1790)
        erarioAnno = selectedYear;
        erarioBaseAmount = substituteTaxSaldo + substituteTaxAcconto1;
        inpsBaseAmount = inpsDue + inpsAcconto1;
        dueDateFormatted = `30/06/${currentYearNum + 1}`;
        isRateizzabile = true;
        break;

      case 'july_surcharge':
        erarioCodice = '1792';
        erarioAnno = selectedYear;
        surchargeMultiplier = 1.004; // +0,40% maggiorazione
        erarioBaseAmount = (substituteTaxSaldo + substituteTaxAcconto1) * surchargeMultiplier;
        inpsBaseAmount = (inpsDue + inpsAcconto1) * surchargeMultiplier;
        dueDateFormatted = `30/07/${currentYearNum + 1}`;
        isRateizzabile = true;
        break;

      case 'nov_acconto2':
        erarioCodice = '1791'; // 2° Acconto o acconto in unica soluzione
        erarioAnno = String(currentYearNum + 1);
        erarioBaseAmount = substituteTaxAcconto2;
        inpsBaseAmount = inpsAcconto2;
        dueDateFormatted = `30/11/${currentYearNum + 1}`;
        isRateizzabile = false; // NON rateizzabile!
        break;
    }

    // Rateizzazione logic
    const totalInst = isRateizzabile ? installmentsCount : 1;
    const curInst = isRateizzabile ? Math.min(currentInstallmentIndex, totalInst) : 1;
    const rateazioneCode = `${String(curInst).padStart(2, '0')}${String(totalInst).padStart(2, '0')}`;
    
    const erarioInstallmentAmount = totalInst > 1 ? (erarioBaseAmount / totalInst) : erarioBaseAmount;
    const inpsInstallmentAmount = totalInst > 1 ? (inpsBaseAmount / totalInst) : inpsBaseAmount;
    const totalBalance = erarioInstallmentAmount + inpsInstallmentAmount;

    return {
      erarioCodice,
      erarioAnno,
      erarioBaseAmount,
      inpsBaseAmount,
      erarioInstallmentAmount,
      inpsInstallmentAmount,
      totalBalance,
      dueDateFormatted,
      isRateizzabile,
      rateazioneCode,
      surchargeMultiplier
    };
  }, [
    selectedSchedule,
    selectedYear,
    currentYearNum,
    substituteTaxSaldo,
    substituteTaxAcconto1,
    substituteTaxAcconto2,
    inpsDue,
    inpsAcconto1,
    inpsAcconto2,
    installmentsCount,
    currentInstallmentIndex
  ]);

  // Sync profile & calculated schedule to formState
  useEffect(() => {
    const isGestioneSeparata = profile.pensionFund === 'INPS_GESTIONE_SEPARATA';
    const isArtigianiCommercianti = profile.pensionFund === 'INPS_ARTIGIANI' || profile.pensionFund === 'INPS_COMMERCIANTI';
    const activeInpsCausale = isGestioneSeparata ? inpsCausaleChoice : (isArtigianiCommercianti ? 'AP' : 'PXX');

    setFormState(prev => ({
      ...prev,
      fiscalCode: profile.fiscalCode || profile.vatNumber || prev.fiscalCode,
      fullName: profile.fullName || prev.fullName,
      erarioCodice: scheduleCalculations.erarioCodice,
      erarioAnno: scheduleCalculations.erarioAnno,
      erarioRateazione: scheduleCalculations.rateazioneCode,
      erarioImporto: scheduleCalculations.erarioInstallmentAmount.toFixed(2),
      inpsCausale: activeInpsCausale,
      inpsPeriodoDa: `01${selectedYear}`,
      inpsPeriodoA: `12${selectedYear}`,
      inpsImporto: scheduleCalculations.inpsInstallmentAmount.toFixed(2),
      saldoFinale: scheduleCalculations.totalBalance.toFixed(2)
    }));
  }, [profile, selectedYear, scheduleCalculations, inpsCausaleChoice]);

  // Reset rateizzazione when switching to November
  useEffect(() => {
    if (selectedSchedule === 'nov_acconto2') {
      setInstallmentsCount(1);
      setCurrentInstallmentIndex(1);
    }
  }, [selectedSchedule]);

  // Set default amount when switching ravvedimento tributo
  useEffect(() => {
    if (ravvCustomAmount === '') {
      if (ravvTributoType === '1792') setRavvCustomAmount(substituteTaxSaldo > 0 ? substituteTaxSaldo.toFixed(2) : '1000.00');
      else if (ravvTributoType === '1790') setRavvCustomAmount(substituteTaxAcconto1 > 0 ? substituteTaxAcconto1.toFixed(2) : '500.00');
      else if (ravvTributoType === '1791') setRavvCustomAmount(substituteTaxAcconto2 > 0 ? substituteTaxAcconto2.toFixed(2) : '500.00');
      else if (ravvTributoType === 'INPS_GS') setRavvCustomAmount(inpsDue > 0 ? inpsDue.toFixed(2) : '1500.00');
    }
  }, [ravvTributoType, substituteTaxSaldo, substituteTaxAcconto1, substituteTaxAcconto2, inpsDue, ravvCustomAmount]);

  // Compute Ravvedimento Operoso details (art. 13 D.Lgs. 472/97)
  const ravvedimentoCalculations = useMemo(() => {
    const amount = parseFloat(ravvCustomAmount) || 0;
    
    // Calculate days late
    let daysLate = 0;
    try {
      const start = new Date(ravvOriginalDueDate);
      const end = new Date(ravvPaymentDate);
      const diffTime = end.getTime() - start.getTime();
      daysLate = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    } catch {
      daysLate = 0;
    }

    // Determine penalty tier according to art. 13 D.Lgs. 472/97:
    // - <= 14 gg: Sprint (0.1% per giorno)
    // - 15..30 gg: Breve (1.50% fisso, 1/10 del 15%)
    // - 31..90 gg: Medio (1.67% fisso, 1/9 del 15%)
    // - 91..dichiarazione successiva: Lungo (3.75% fisso, 1/8 del 30%)
    // - Oltre dichiarazione successiva: Lunghissimo (4.29% fisso, 1/7 del 30%)
    let penaltyPercent = 0;
    let penaltyTierLabel = '';
    let penaltyDescription = '';

    if (daysLate === 0) {
      penaltyPercent = 0;
      penaltyTierLabel = 'Nessun ritardo';
      penaltyDescription = 'Il versamento viene effettuato entro i termini ordinari.';
    } else if (daysLate <= 14) {
      penaltyPercent = 0.1 * daysLate; // 0.1% al giorno
      penaltyTierLabel = 'Ravvedimento Sprint (Entro 14 gg)';
      penaltyDescription = `0,1% per ogni giorno di ritardo (${daysLate} gg = ${(0.1 * daysLate).toFixed(2)}%)`;
    } else if (daysLate <= 30) {
      penaltyPercent = 1.50;
      penaltyTierLabel = 'Ravvedimento Breve (15° - 30° giorno)';
      penaltyDescription = '1,50% fisso (pari a 1/10 della sanzione ordinaria del 15%)';
    } else if (daysLate <= 90) {
      penaltyPercent = 1.67;
      penaltyTierLabel = 'Ravvedimento Medio (31° - 90° giorno)';
      penaltyDescription = '1,67% fisso (pari a 1/9 della sanzione ordinaria del 15%)';
    } else if (daysLate <= 365) {
      penaltyPercent = 3.75;
      penaltyTierLabel = 'Ravvedimento Lungo (Oltre 90 gg entro dichiarazione anno succ.)';
      penaltyDescription = '3,75% fisso (pari a 1/8 della sanzione ordinaria del 30%)';
    } else {
      penaltyPercent = 4.29;
      penaltyTierLabel = 'Ravvedimento Lunghissimo (Oltre dichiarazione anno succ.)';
      penaltyDescription = '4,29% fisso (pari a 1/7 della sanzione ordinaria del 30%)';
    }

    const sanzioneImporto = (amount * (penaltyPercent / 100));
    
    // Formula interessi legali a giorni: (Importo * Tasso * Giorni) / 36500
    const interessiImporto = (amount * (ravvLegalRate / 100) * daysLate) / 365;

    // Sanzione tardiva dichiarazione redditi (25 € codice 8911 se entro 90 gg)
    const tardivaAmount = ravvIncludeTardiva ? 25.00 : 0;

    const totaleDaVersare = amount + sanzioneImporto + interessiImporto + tardivaAmount;

    return {
      daysLate,
      penaltyPercent,
      penaltyTierLabel,
      penaltyDescription,
      sanzioneImporto,
      interessiImporto,
      tardivaAmount,
      totaleDaVersare,
      amount
    };
  }, [ravvCustomAmount, ravvOriginalDueDate, ravvPaymentDate, ravvLegalRate, ravvIncludeTardiva]);

  // Handle PDF/Image File Selection for visual canvas
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
        const parsedEntries = await extractF24DataFromPdf(selectedFile);
        setExtractedF24Entries(parsedEntries);
        if (parsedEntries.length > 0) {
          const erarioEntry = parsedEntries.find(e => ['1790', '1791', '1792', '4001', '4002'].includes(e.taxCode));
          const inpsEntry = parsedEntries.find(e => ['PXX', 'P10', 'AF', 'CF', 'AP', 'CP'].includes(e.taxCode));
          const totalAmount = parsedEntries.reduce((sum, e) => sum + e.amount, 0);

          setFormState(prev => ({
            ...prev,
            erarioCodice: erarioEntry ? erarioEntry.taxCode : prev.erarioCodice,
            erarioImporto: erarioEntry ? erarioEntry.amount.toFixed(2) : prev.erarioImporto,
            erarioAnno: erarioEntry?.year || prev.erarioAnno,
            inpsCausale: inpsEntry ? inpsEntry.taxCode : prev.inpsCausale,
            inpsImporto: inpsEntry ? inpsEntry.amount.toFixed(2) : prev.inpsImporto,
            saldoFinale: totalAmount.toFixed(2)
          }));
          
          const detailsList = parsedEntries.map(e => `${e.taxCode}: € ${e.amount.toFixed(2)}`).join(', ');
          setStatusMessage(`✅ Modello F24 analizzato: rilevate ${parsedEntries.length} righe (${detailsList}). Gli acconti verranno applicati al report dell'anno successivo.`);
        } else {
          setStatusMessage('File caricato. Nessun tributo estratto in automatico: puoi compilarlo manualmente.');
        }
      } else {
        setStatusMessage('Immagine caricata. Compila i campi per sovrapporre i dati visivamente.');
      }
      setActiveTab('visual');
    } catch (err) {
      console.error(err);
      setStatusMessage('File caricato con avvisi durante l\'estrazione automatica.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Canvas visual rendering for loaded files
  useEffect(() => {
    let isCurrent = true;
    if (!file || activeTab !== 'visual' || !canvasRef.current) return;

    const render = async () => {
      setIsRendering(true);
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (fileType === 'pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdfDoc = await loadingTask.promise;
          const page = await pdfDoc.getPage(1);
          
          const defaultViewport = page.getViewport({ scale: 1.0 });
          const desiredWidth = 800;
          const scale = desiredWidth / defaultViewport.width;
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

  const handleDownloadStandardF24 = (type: 'imposta' | 'contributi') => {
    if (type === 'imposta') {
      const amount = parseFloat(formState.erarioImporto) || scheduleCalculations.erarioInstallmentAmount || 0;
      const pType = formState.erarioCodice === '1792' ? 'saldo' : (formState.erarioCodice === '1790' ? 'acconto1' : 'acconto2');
      generateF24PDF(profile, amount, 'imposta', pType, selectedYear);
    } else {
      const amount = parseFloat(formState.inpsImporto) || scheduleCalculations.inpsInstallmentAmount || 0;
      const pType = selectedSchedule === 'nov_acconto2' ? 'acconto2' : (selectedSchedule === 'june_acconto1' ? 'acconto1' : 'saldo');
      generateF24PDF(profile, amount, 'contributi', pType, selectedYear, formState.inpsCausale);
    }
  };

  const handleDownloadRavvedimentoPDF = () => {
    const isErario = ravvTributoType !== 'INPS_GS';
    const amount = ravvedimentoCalculations.amount;
    
    generateRavvedimentoF24PDF({
      profile,
      year: selectedYear,
      taxCode: isErario ? ravvTributoType : '1792',
      impostaAmount: isErario ? amount : 0,
      sanzioneAmount: isErario ? ravvedimentoCalculations.sanzioneImporto : 0,
      interessiAmount: isErario ? ravvedimentoCalculations.interessiImporto : 0,
      isTardivaDichiarazione: ravvIncludeTardiva,
      tardivaAmount: 25.00,
      inpsCausale: inpsCausaleChoice,
      inpsTotalAmount: !isErario ? ravvedimentoCalculations.totaleDaVersare : 0,
      inpsSede: formState.inpsSede || '8200',
      dataRavvedimento: new Date(ravvPaymentDate).toLocaleDateString('it-IT')
    });
  };

  const handleSaveToRegister = (isRavvedimento: boolean = false) => {
    if (!onAddF24Entries) return;

    const entriesToSave = [];

    if (isRavvedimento) {
      const isErario = ravvTributoType !== 'INPS_GS';
      if (isErario) {
        entriesToSave.push({
          taxCode: ravvTributoType,
          amount: ravvedimentoCalculations.amount,
          date: ravvPaymentDate,
          description: `F24 Ravvedimento - Tributo ${ravvTributoType} (${selectedYear})`,
          source: 'RAVVEDIMENTO'
        });
        if (ravvedimentoCalculations.sanzioneImporto > 0 || ravvIncludeTardiva) {
          entriesToSave.push({
            taxCode: '8911',
            amount: ravvedimentoCalculations.sanzioneImporto + (ravvIncludeTardiva ? 25 : 0),
            date: ravvPaymentDate,
            description: `F24 Ravvedimento - Sanzioni Tributo 8911`,
            source: 'RAVVEDIMENTO'
          });
        }
        if (ravvedimentoCalculations.interessiImporto > 0) {
          entriesToSave.push({
            taxCode: '1989',
            amount: ravvedimentoCalculations.interessiImporto,
            date: ravvPaymentDate,
            description: `F24 Ravvedimento - Interessi Tributo 1989`,
            source: 'RAVVEDIMENTO'
          });
        }
      } else {
        entriesToSave.push({
          taxCode: inpsCausaleChoice,
          amount: ravvedimentoCalculations.totaleDaVersare,
          date: ravvPaymentDate,
          description: `F24 Ravvedimento INPS ${inpsCausaleChoice} (Contributi + Sanzioni/Interessi unificati)`,
          source: 'RAVVEDIMENTO'
        });
      }
    } else {
      if (extractedF24Entries.length > 0) {
        extractedF24Entries.forEach(entry => {
          const isAcconto = entry.taxCode === '1790' || 
                            entry.taxCode === '1791' || 
                            (entry.taxCode === 'PXX' && (entry.deadlineType === 'acconto1' || entry.deadlineType === 'acconto2' || entry.description?.toLowerCase().includes('acconto') || entry.amount <= 100));
          const entryYear = entry.year || selectedYear;
          const targetYear = isAcconto ? String(parseInt(entryYear, 10) + 1) : entryYear;
          entriesToSave.push({
            taxCode: entry.taxCode,
            amount: entry.amount,
            date: `${entryYear}-06-30`,
            description: entry.description || `Quietanza PDF (Codice ${entry.taxCode})`,
            source: 'PDF',
            isAcconto,
            targetYear,
            accontoType: entry.deadlineType === 'acconto1' ? '1_acconto' : (entry.deadlineType === 'acconto2' ? '2_acconto' : 'saldo')
          });
        });
      } else {
        const erarioAmount = parseFloat(formState.erarioImporto);
        const inpsAmount = parseFloat(formState.inpsImporto);

        if (!isNaN(erarioAmount) && erarioAmount > 0) {
          const isAcconto = formState.erarioCodice === '1790' || formState.erarioCodice === '1791';
          const targetYear = isAcconto ? String(parseInt(selectedYear, 10) + 1) : selectedYear;
          entriesToSave.push({
            taxCode: formState.erarioCodice,
            amount: erarioAmount,
            date: `${selectedYear}-06-30`,
            description: `Quietanza F24 Erario (Codice Tributo ${formState.erarioCodice})`,
            source: 'PRE_COMPILATO',
            isAcconto,
            targetYear
          });
        }

        if (!isNaN(inpsAmount) && inpsAmount > 0) {
          const isAcconto = selectedSchedule === 'june_acconto1' || selectedSchedule === 'nov_acconto2';
          const targetYear = isAcconto ? String(parseInt(selectedYear, 10) + 1) : selectedYear;
          entriesToSave.push({
            taxCode: formState.inpsCausale,
            amount: inpsAmount,
            date: `${selectedYear}-06-30`,
            description: `Quietanza F24 INPS (Causale ${formState.inpsCausale})`,
            source: 'PRE_COMPILATO',
            isAcconto,
            targetYear
          });
        }
      }
    }

    if (entriesToSave.length === 0) {
      alert("Nessun importo valido da registrare nel bilancio.");
      return;
    }

    onAddF24Entries(entriesToSave);
    alert(`F24 registrato con successo nel gestionale! Inserite ${entriesToSave.length} quietanze.`);
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
  const agenziaEntrateF24WebUrl = "https://www.agenziaentrate.gov.it/portale/schede/pagamenti/f24/f24-web";

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-7 flex flex-col gap-6" id="f24-preview-canvas-overlay">
      
      {/* Header section with tabs */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 pb-5">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
            Workspace Compilazione & Scadenze Modello F24
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Gestisci acconti, saldi, rateizzazioni e sanatoria tramite Ravvedimento Operoso per il Regime Forfettario.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('assisted')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'assisted'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Compilazione Ordinaria & Scadenze
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('ravvedimento')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'ravvedimento'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-700 hover:bg-rose-50'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Ravvedimento Operoso (Sanatoria)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('visual')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
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

      {/* BANNER INFORMATIVO PERMANENTE: CANALI TELEMATICI E DIVIETO F24 CARTACEO */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-500/20 text-amber-700 rounded-xl shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
              Obbligo di Versamento Esclusivamente Telematico (Divieto F24 Cartaceo)
            </h4>
            <p className="text-xs text-amber-900/90 leading-relaxed">
              Tutti i titolari di partita IVA in regime forfettario <strong>hanno il divieto assoluto di pagare l'F24 cartaceo allo sportello bancario o postale</strong>.
              I canali telematici obbligatori sono: <strong>1) Fisconline / Entratel (F24 Web / Fatture e Corrispettivi)</strong>; <strong>2) Home Banking / Internet Banking</strong> della tua banca o di Poste Italiane; <strong>3) Commercialista / intermediario delegato con addebito IBAN</strong>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={agenziaEntrateF24WebUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            <span>F24 Web Entrate</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {activeTab === 'assisted' && (
        /* ASSISTED ORDINARY COMPILATION MODE */
        <div className="space-y-6 animate-fade-in">

          {/* Scadenza & Preset Selector Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  Seleziona Scadenza Ordinaria di Versamento
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  L'imposta sostitutiva e i contributi della Gestione Separata si calcolano e versano contestualmente con le medesime scadenze.
                </p>
              </div>

              {/* Causale INPS Switcher */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Causale INPS:</span>
                <button
                  type="button"
                  onClick={() => setInpsCausaleChoice('PXX')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    inpsCausaleChoice === 'PXX'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="PXX: Liberi professionisti senza altra forma di previdenza e non pensionati"
                >
                  PXX (No Altra Cassa)
                </button>
                <button
                  type="button"
                  onClick={() => setInpsCausaleChoice('P10')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    inpsCausaleChoice === 'P10'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="P10: Soggetti iscritti ad altra previdenza obbligatoria o titolari di pensione"
                >
                  P10 (Con Altra Cassa / Pensione)
                </button>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => setSelectedSchedule('june_both')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedSchedule === 'june_both'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="text-[10px] font-black uppercase opacity-80">30 Giugno (Consigliato)</div>
                <div className="text-xs font-bold mt-1">Saldo + 1° Acconto</div>
                <div className="text-[10px] opacity-80 mt-1 font-mono">Cod. 1792 + 1790</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSchedule('june_saldo')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedSchedule === 'june_saldo'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="text-[10px] font-black uppercase opacity-80">30 Giugno</div>
                <div className="text-xs font-bold mt-1">Solo Saldo Anno Prec.</div>
                <div className="text-[10px] opacity-80 mt-1 font-mono">Cod. 1792 ({selectedYear})</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSchedule('june_acconto1')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedSchedule === 'june_acconto1'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="text-[10px] font-black uppercase opacity-80">30 Giugno</div>
                <div className="text-xs font-bold mt-1">1° Acconto (40% PXX - 50% Erario)</div>
                <div className="text-[10px] opacity-80 mt-1 font-mono">Cod. 1790 / PXX ({currentYearNum + 1})</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSchedule('july_surcharge')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedSchedule === 'july_surcharge'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="text-[10px] font-black uppercase opacity-80">30 Luglio</div>
                <div className="text-xs font-bold mt-1">Maggiorazione +0,40%</div>
                <div className="text-[10px] opacity-80 mt-1 font-mono">Interesse differimento</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSchedule('nov_acconto2')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedSchedule === 'nov_acconto2'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="text-[10px] font-black uppercase opacity-80">30 Novembre</div>
                <div className="text-xs font-bold mt-1">2° Acconto (60% PXX - 50% Erario)</div>
                <div className="text-[10px] opacity-80 mt-1 font-mono">Cod. 1791 / PXX (Unica Soluz.)</div>
              </button>
            </div>

            {/* Rateizzazione Configuration Box */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  Rateizzazione del Saldo e del 1° Acconto (Max 7-8 rate mensili entro Novembre)
                </span>
                <p className="text-[11px] text-slate-500">
                  {scheduleCalculations.isRateizzabile ? (
                    <>Puoi frazionare il versamento di giugno/luglio in rate mensili di pari importo con scadenza finale a novembre.</>
                  ) : (
                    <strong className="text-rose-600">
                      Attenzione: Il 2° acconto di novembre deve essere versato inderogabilmente in un'unica soluzione (non rateizzabile).
                    </strong>
                  )}
                </p>
              </div>

              {scheduleCalculations.isRateizzabile ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">N° Rate:</label>
                    <select
                      value={installmentsCount}
                      onChange={(e) => {
                        const count = parseInt(e.target.value, 10);
                        setInstallmentsCount(count);
                        if (currentInstallmentIndex > count) setCurrentInstallmentIndex(count);
                      }}
                      className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-800"
                    >
                      <option value="1">1 Rata (Unica Soluzione 0101)</option>
                      <option value="2">2 Rate Mensili (0102)</option>
                      <option value="3">3 Rate Mensili (0103)</option>
                      <option value="4">4 Rate Mensili (0104)</option>
                      <option value="5">5 Rate Mensili (0105)</option>
                      <option value="6">6 Rate Mensili (0106)</option>
                      <option value="7">7 Rate Mensili (0107)</option>
                      <option value="8">8 Rate Mensili (0108)</option>
                    </select>
                  </div>

                  {installmentsCount > 1 && (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Rata n°:</label>
                      <select
                        value={currentInstallmentIndex}
                        onChange={(e) => setCurrentInstallmentIndex(parseInt(e.target.value, 10))}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 font-mono"
                      >
                        {Array.from({ length: installmentsCount }, (_, i) => i + 1).map((idx) => (
                          <option key={idx} value={idx}>
                            Rata {idx} di {installmentsCount} ({String(idx).padStart(2, '0')}{String(installmentsCount).padStart(2, '0')})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-mono font-bold">
                  Codice Rateazione: 0101
                </span>
              )}
            </div>
          </div>

          {/* Form Fields Copier Column */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            <div className="lg:col-span-8 space-y-6">
              
              {/* Sezione 1: Contribuente */}
              <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    1. Dati Contribuente (No IRPEF per Forfettari)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Modello F24 Telematico</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Codice Fiscale */}
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

              {/* Sezione 2: Erario (Imposta Sostitutiva 1790, 1791, 1792) */}
              <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    2. Sezione Erario · Imposta Sostitutiva ({profile.isStartup ? '5% Nuova Attività' : '15% Ordinaria'})
                  </span>
                  <span className="text-[10px] font-mono text-indigo-600 font-bold">PRE-CALCOLATO</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

                  {/* Rateazione */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rateazione</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-bold text-slate-800 text-xs flex-1 text-center bg-slate-50 py-0.5 rounded border border-slate-100">{formState.erarioRateazione}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('erarioRateazione', formState.erarioRateazione)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'erarioRateazione'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia rateazione"
                      >
                        {copiedField === 'erarioRateazione' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Importo Quota Debito (€)</label>
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

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2 gap-2 text-[10px] text-slate-500">
                  <span>Codici tributo ufficiali: <strong>1790</strong> (1° acconto) · <strong>1791</strong> (2° acconto o unica soluz.) · <strong>1792</strong> (saldo).</span>
                  <button
                    type="button"
                    onClick={() => handleDownloadStandardF24('imposta')}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg transition-all border border-indigo-100"
                  >
                    <Download className="w-3 h-3" />
                    Scarica F24 Erario PDF
                  </button>
                </div>
              </div>

              {/* Sezione 3: INPS Gestione Separata (PXX / P10) */}
              <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    3. Sezione INPS · Gestione Separata / Cassa Previdenziale
                  </span>
                  <span className="text-[10px] font-mono text-indigo-600 font-bold">PRE-CALCOLATO</span>
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

                  {/* Periodo Da / A */}
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Periodo Rif. (Da - A)</label>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm">
                      <span className="font-mono font-bold text-slate-800 text-xs flex-1 text-center">{formState.inpsPeriodoDa} - {formState.inpsPeriodoA}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard('inpsPeriodoDa', formState.inpsPeriodoDa)}
                        className={`p-1.5 rounded-lg transition-all border cursor-pointer ${
                          copiedField === 'inpsPeriodoDa'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                        title="Copia periodo"
                      >
                        {copiedField === 'inpsPeriodoDa' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Importo INPS */}
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Importo Contributi (€)</label>
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

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2 gap-2 text-[10px] text-slate-500">
                  <span>Causali Gestione Separata: <strong>PXX</strong> (privi di altra cassa e non pensionati) · <strong>P10</strong> (iscritti ad altra previdenza o pensionati).</span>
                  <button
                    type="button"
                    onClick={() => handleDownloadStandardF24('contributi')}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg transition-all border border-indigo-100"
                  >
                    <Download className="w-3 h-3" />
                    Scarica F24 INPS PDF
                  </button>
                </div>
              </div>

            </div>

            {/* Sidebar Summary Card */}
            <div className="lg:col-span-4 space-y-5">
              <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-lg space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Riepilogo Versamento F24</h4>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold">
                    Scad. {scheduleCalculations.dueDateFormatted}
                  </span>
                </div>
                
                <div className="space-y-2 border-b border-slate-800 pb-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Quota Imposta ({formState.erarioCodice}):</span>
                    <span className="font-mono font-bold text-slate-200">
                      € {parseFloat(formState.erarioImporto || '0').toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Quota INPS ({formState.inpsCausale}):</span>
                    <span className="font-mono font-bold text-slate-200">
                      € {parseFloat(formState.inpsImporto || '0').toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {installmentsCount > 1 && (
                    <div className="flex justify-between items-center text-xs text-indigo-400 pt-1 border-t border-slate-800/60 font-semibold">
                      <span>Rateizzazione Attiva:</span>
                      <span>{installmentsCount} rate mensili ({formState.erarioRateazione})</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-300">Totale Singolo F24:</span>
                  <span className="text-xl font-mono font-black text-emerald-400">
                    € {parseFloat(formState.saldoFinale || '0').toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => handleSaveToRegister(false)}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md shadow-emerald-950 flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4 text-white" />
                    <span>Registra come Pagato nel Bilancio</span>
                  </button>
                  
                  <a 
                    href={externalF24Url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 border border-slate-700 text-center"
                  >
                    <span>Apri Amministrazioni Comunali</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </a>
                </div>
              </div>

              {/* Instructions Panel */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs text-slate-600">
                <div className="font-bold text-slate-800 flex items-center gap-1.5 uppercase text-[11px]">
                  <HelpCircle className="w-4 h-4 text-indigo-500" />
                  <span>Regole Saldo e Acconto</span>
                </div>
                <ul className="space-y-1.5 list-disc pl-4 text-[11px] leading-relaxed">
                  <li><strong>Saldo precedente + 1° Acconto (50%)</strong> si versano entro il <strong>30 Giugno</strong> (o 30 Luglio con +0,40%).</li>
                  <li><strong>Secondo acconto (50%)</strong> si versa entro il <strong>30 Novembre</strong> in unica soluzione (non rateizzabile).</li>
                  <li>In caso di ritardo o mancato versamento, utilizza la scheda <strong>Ravvedimento Operoso</strong> in alto per calcolare sanzioni ridotte e interessi legali.</li>
                </ul>
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'ravvedimento' && (
        /* RAVVEDIMENTO OPEROSO & DICHIARAZIONE TARDIVA / OMESSA CALCULATOR */
        <div className="space-y-6 animate-fade-in">
          
          <div className="bg-gradient-to-r from-rose-950 to-slate-900 text-white rounded-2xl p-5 border border-rose-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2 text-rose-300 font-extrabold text-xs tracking-wider uppercase">
                <ShieldCheck className="w-4 h-4 text-rose-400" />
                <span>Sanatoria Spontanea · Art. 13 D.Lgs. 472/97</span>
              </div>
              <p className="text-sm font-bold text-white leading-relaxed">
                Calcolatore Ufficiale Ravvedimento Operoso per Omesso o Tardivo Versamento F24
              </p>
              <p className="text-xs text-slate-300 leading-normal">
                Se hai saltato le scadenze del 30 Giugno o del 30 Novembre, puoi regolarizzare spontaneamente la posizione pagando l'imposta con sanzioni ridotte ed interessi legali calcolati a giorni, evitando le sanzioni piene dell'Agenzia delle Entrate e dell'INPS.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Input Configuration Column */}
            <div className="lg:col-span-7 space-y-5">
              
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Calculator className="w-4 h-4 text-rose-600" />
                  1. Parametri del Tributo Omesso
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Scelta Tributo */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tributo da Regolarizzare</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRavvTributoType('1792');
                          setRavvOriginalDueDate(`${currentYearNum + 1}-06-30`);
                        }}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          ravvTributoType === '1792'
                            ? 'bg-rose-600 text-white font-bold border-rose-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300'
                        }`}
                      >
                        <div className="text-xs font-mono">Cod. 1792</div>
                        <div className="text-[10px] opacity-80">Saldo Imposta</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRavvTributoType('1790');
                          setRavvOriginalDueDate(`${currentYearNum + 1}-06-30`);
                        }}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          ravvTributoType === '1790'
                            ? 'bg-rose-600 text-white font-bold border-rose-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300'
                        }`}
                      >
                        <div className="text-xs font-mono">Cod. 1790</div>
                        <div className="text-[10px] opacity-80">1° Acconto</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRavvTributoType('1791');
                          setRavvOriginalDueDate(`${currentYearNum + 1}-11-30`);
                        }}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          ravvTributoType === '1791'
                            ? 'bg-rose-600 text-white font-bold border-rose-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300'
                        }`}
                      >
                        <div className="text-xs font-mono">Cod. 1791</div>
                        <div className="text-[10px] opacity-80">2° Acconto</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRavvTributoType('INPS_GS');
                          setRavvOriginalDueDate(`${currentYearNum + 1}-06-30`);
                        }}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          ravvTributoType === 'INPS_GS'
                            ? 'bg-rose-600 text-white font-bold border-rose-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300'
                        }`}
                      >
                        <div className="text-xs font-mono">INPS {inpsCausaleChoice}</div>
                        <div className="text-[10px] opacity-80">Gestione Separata</div>
                      </button>
                    </div>
                  </div>

                  {/* Importo Omesso */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Importo Tributo Non Versato (€)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-xs">€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ravvCustomAmount}
                        onChange={(e) => setRavvCustomAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-sm font-bold text-slate-800 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>

                  {/* Scadenza Originaria */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scadenza Originaria Non Rispettata</label>
                    <input
                      type="date"
                      value={ravvOriginalDueDate}
                      onChange={(e) => setRavvOriginalDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  {/* Data Presunta Versamento in Ravvedimento */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data di Effettivo Pagamento</label>
                    <input
                      type="date"
                      value={ravvPaymentDate}
                      onChange={(e) => setRavvPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  {/* Tasso Interesse Legale */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tasso Interesse Legale Annuo (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={ravvLegalRate}
                        onChange={(e) => setRavvLegalRate(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-rose-500"
                      />
                      <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 font-bold text-xs">%</span>
                    </div>
                  </div>
                </div>

                {/* Opzione Dichiarazione Tardiva REDDITI PF */}
                <div className="bg-white border border-rose-200/80 rounded-xl p-3.5 space-y-2 mt-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ravvIncludeTardiva}
                      onChange={(e) => setRavvIncludeTardiva(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-900 block">
                        Includi Sanzione Fissa Dichiarazione Tardiva Modello REDDITI PF (+25,00 € - Codice Tributo 8911)
                      </span>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Se la dichiarazione dei redditi non è stata inviata entro i termini ordinari ma viene trasmessa <strong>entro i 90 giorni di tolleranza</strong>, la dichiarazione è considerata valida e tardiva versando la sanzione fissa di 25 € con codice tributo 8911. Superati i 90 giorni è legalmente omessa, ma va comunque presentata.
                      </p>
                    </div>
                  </label>
                </div>

              </div>

              {/* Dettaglio Scaglioni Sanzioni Ridotte */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
                <span className="font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-rose-600" />
                  Tabella Sanzioni Ridotte Ufficiali (Art. 13 D.Lgs. 472/97)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-600">
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <strong className="text-slate-800 block">Entro 14 giorni (Sprint):</strong>
                    0,1% per ogni giorno di ritardo
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <strong className="text-slate-800 block">Dal 15° al 30° giorno (Breve):</strong>
                    1,50% fisso (1/10 del 15%)
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <strong className="text-slate-800 block">Dal 31° al 90° giorno (Medio):</strong>
                    1,67% fisso (1/9 del 15%)
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <strong className="text-slate-800 block">Oltre 90 gg fino a dichiarazione succ.:</strong>
                    3,75% fisso (1/8 del 30%)
                  </div>
                </div>
              </div>

            </div>

            {/* Live Breakdown & Resulting F24 Column */}
            <div className="lg:col-span-5 space-y-5">
              
              {/* Calculations Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-lg space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Calcolo Ravvedimento</h4>
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded font-mono font-bold">
                    {ravvedimentoCalculations.daysLate} giorni di ritardo
                  </span>
                </div>

                <div className="space-y-2 border-b border-slate-800 pb-4 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Importo Originario:</span>
                    <span className="font-mono font-bold text-white">€ {ravvedimentoCalculations.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Scaglione Sanzione:</span>
                    <span className="text-rose-400 font-bold">{ravvedimentoCalculations.penaltyPercent.toFixed(2)}%</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Sanzione Ridotta:</span>
                    <span className="font-mono font-bold text-rose-400">€ {ravvedimentoCalculations.sanzioneImporto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Interessi Legali a giorni ({ravvLegalRate}%):</span>
                    <span className="font-mono font-bold text-amber-300">€ {ravvedimentoCalculations.interessiImporto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                  </div>

                  {ravvIncludeTardiva && (
                    <div className="flex justify-between text-rose-300 border-t border-slate-800 pt-1">
                      <span>Sanzione Fissa Dichiarazione Tardiva:</span>
                      <span className="font-mono font-bold">€ 25,00</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-300">Totale F24 Sanatoria:</span>
                  <span className="text-xl font-mono font-black text-emerald-400">
                    € {ravvedimentoCalculations.totaleDaVersare.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleDownloadRavvedimentoPDF}
                    className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md shadow-rose-950 flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4 text-white" />
                    <span>Scarica Modello F24 Ravvedimento PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveToRegister(true)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 border border-slate-700"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Registra Quietanza Sanatoria nel Bilancio</span>
                  </button>
                </div>
              </div>

              {/* Righi Compilati per F24 Online */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="font-bold text-slate-800 uppercase text-[11px] block border-b border-slate-200 pb-1.5">
                  Codici Tributo F24 da Inserire
                </span>

                {ravvTributoType !== 'INPS_GS' ? (
                  <div className="space-y-2 text-xs font-mono">
                    {/* Rigo 1 Imposta */}
                    <div className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between items-center">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-sans">1. Imposta Omessa</div>
                        <div className="font-bold text-slate-800">Tributo {ravvTributoType} · Anno {selectedYear}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900">€ {ravvedimentoCalculations.amount.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard('ravv_tributo', ravvedimentoCalculations.amount.toFixed(2))}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          {copiedField === 'ravv_tributo' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    {/* Rigo 2 Sanzione 8911 */}
                    <div className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between items-center">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-sans">2. Sanzione Pecuniaria</div>
                        <div className="font-bold text-rose-700">Tributo 8911 · Anno {selectedYear}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-rose-700">€ {(ravvedimentoCalculations.sanzioneImporto + ravvedimentoCalculations.tardivaAmount).toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard('ravv_8911', (ravvedimentoCalculations.sanzioneImporto + ravvedimentoCalculations.tardivaAmount).toFixed(2))}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          {copiedField === 'ravv_8911' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    {/* Rigo 3 Interessi 1989 */}
                    <div className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between items-center">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-sans">3. Interessi Ravvedimento</div>
                        <div className="font-bold text-amber-700">Tributo 1989 · Anno {selectedYear}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-amber-700">€ {ravvedimentoCalculations.interessiImporto.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard('ravv_1989', ravvedimentoCalculations.interessiImporto.toFixed(2))}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          {copiedField === 'ravv_1989' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                      <div className="text-[10px] text-emerald-800 uppercase font-sans font-bold">Regola INPS per Ravvedimento</div>
                      <p className="text-[11px] text-emerald-950 font-sans mt-0.5 leading-normal">
                        Per la Gestione Separata INPS <strong>non si compilano righi separati per sanzioni e interessi</strong>: le somme dovute per sanzioni civili e interessi si sommano direttamente all'importo del contributo principale sulla causale <strong>{inpsCausaleChoice}</strong>!
                      </p>
                      <div className="mt-2 pt-2 border-t border-emerald-200 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-emerald-900 block">Causale {inpsCausaleChoice} (Unificato)</span>
                          <span className="text-[10px] text-emerald-700">Sede {formState.inpsSede} · Periodo 01/{selectedYear} - 12/{selectedYear}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-emerald-950 text-sm">€ {ravvedimentoCalculations.totaleDaVersare.toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyToClipboard('ravv_inps_tot', ravvedimentoCalculations.totaleDaVersare.toFixed(2))}
                            className="p-1 text-emerald-700 hover:text-emerald-900"
                          >
                            {copiedField === 'ravv_inps_tot' ? <Check className="w-3 h-3 text-emerald-800" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>
      )}

      {activeTab === 'visual' && (
        /* VISUAL REVISION MODE */
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

                    {/* 8. INPS - Importo */}
                    <div className="absolute" style={{ top: '40.2%', left: '61.2%', width: '14.8%', height: '2.2%' }}>
                      <input
                        type="text"
                        value={formState.inpsImporto}
                        onChange={(e) => handleInputChange('inpsImporto', e.target.value)}
                        placeholder="0.00"
                        className="w-full h-full bg-emerald-100/50 focus:bg-emerald-100/90 border border-emerald-500/30 text-[10px] sm:text-xs font-mono font-extrabold text-slate-800 px-1 rounded text-right shadow-sm focus:outline-none"
                      />
                    </div>

                    {/* 9. Saldo Finale */}
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

                  {extractedF24Entries.length > 0 && (
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-2">
                      <div className="text-[10px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Righe Estratte &amp; Destinazione Acconti ({extractedF24Entries.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {extractedF24Entries.map((e, idx) => {
                          const isAcconto = e.taxCode === '1790' || e.taxCode === '1791' || 
                            (e.taxCode === 'PXX' && (e.deadlineType === 'acconto1' || e.deadlineType === 'acconto2' || e.description?.toLowerCase().includes('acconto') || e.amount <= 100));
                          const entryYear = e.year || selectedYear;
                          const targetYear = isAcconto ? String(parseInt(entryYear, 10) + 1) : entryYear;
                          return (
                            <div key={idx} className="p-2 bg-white rounded-lg border border-emerald-100 flex items-center justify-between text-xs">
                              <div>
                                <div className="font-bold text-slate-800 font-mono flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] text-slate-700">{e.taxCode}</span>
                                  <span>€ {e.amount.toFixed(2)}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  {isAcconto ? (
                                    <span className="text-emerald-700 font-semibold">
                                      ✨ Acconto: confluirà nel report del {targetYear}
                                    </span>
                                  ) : (
                                    <span>Saldo competenza {entryYear}</span>
                                  )}
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">{entryYear}</span>
                            </div>
                          );
                        })}
                      </div>
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
                    onClick={() => handleSaveToRegister(false)}
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
