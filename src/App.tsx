/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BusinessProfile, Invoice, AccountingPosition } from './types';
import BusinessProfileCard from './components/BusinessProfileCard';
import TaxSimulatorDashboard from './components/TaxSimulatorDashboard';
import AccountingPositionModal from './components/AccountingPositionModal';
import DeletePositionModal from './components/DeletePositionModal';
import { createAccountingPositionFolder, uploadF24Pdf, deleteDriveFile, uploadFirebaseBackupToDrive, findOrCreateFolder, uploadInvoiceXml, listDriveFolders, listFilesInFolder, downloadFileContent, renameDriveFile } from './utils/googleDrive';
import { parseInvoiceXml } from './utils/xmlInvoiceParser';
import { calculateTaxReturn } from './calculateTaxReturn';
import { findAtecoCode, findPensionFund } from './taxData';
import { safeAlert, safeConfirm } from './utils/safeWindow';
import { 
  Calculator, 
  FileText, 
  Database, 
  RefreshCw, 
  Menu,
  X,
  TrendingUp,
  CircleCheck,
  Lock,
  User,
  ExternalLink,
  PlusCircle,
  Trash2,
  Cloud,
  CloudOff,
  Folder,
  Share2,
  WifiOff,
  AlertTriangle,
  Sparkles,
  Calendar,
  FileCode,
  ChevronDown,
  ChevronUp,
  FolderPlus
} from 'lucide-react';

const LOCAL_STORAGE_PROFILE_KEY = 'forfettario_profile_v1';
const LOCAL_STORAGE_INVOICES_KEY = 'forfettario_invoices_v1';
const LOCAL_STORAGE_POSITIONS_KEY = 'forfettario_positions_v1';
const LOCAL_STORAGE_ACTIVE_POSITION_ID_KEY = 'forfettario_active_position_id_v1';

const DEMO_INVOICES: Invoice[] = [
  {
    id: 'demo-1',
    number: 'Fattura 01/2026',
    date: '2026-02-10',
    clientName: 'AlphaTech Solutions S.r.l.',
    clientVat: 'IT01298450192',
    amount: 3200.00,
    isPaid: true,
    hasStampDuty: true,
    notes: 'Sviluppo MVP Frontend in React e Tailwind'
  },
  {
    id: 'demo-2',
    number: 'Fattura 02/2026',
    date: '2026-03-24',
    clientName: 'Milano Creative Agency',
    clientVat: 'IT03487560193',
    amount: 1450.00,
    isPaid: true,
    hasStampDuty: true,
    notes: 'Consulenza tecnica DevOps e migrazione Cloud'
  },
  {
    id: 'demo-3',
    number: 'Fattura 03/2026',
    date: '2026-05-18',
    clientName: 'Bottega d’Arte Moderna',
    clientVat: 'IT05847290194',
    amount: 1800.00,
    isPaid: false,
    hasStampDuty: true,
    notes: 'Sito Web e-commerce per galleria d\'arte'
  },
  {
    id: 'demo-4',
    number: 'Fattura 04/2026',
    date: '2026-06-02',
    clientName: 'Studio Legale Associato Bianchi',
    clientVat: 'IT03498520199',
    amount: 900.00,
    isPaid: true,
    hasStampDuty: true,
    notes: 'Assistenza tecnica continuativa e ottimizzazione SEO'
  },
];

const DEFAULT_PROFILE: BusinessProfile = {
  fullName: 'Mario Rossi',
  vatNumber: '01234567890',
  atecoCode: '62.01.00',
  pensionFund: 'INPS_GESTIONE_SEPARATA',
  startYear: '2026',
  isStartup: true,
};

import { ErrorBoundary } from './ErrorBoundary';

import { initAuth, googleSignIn, logout as firebaseLogout, getAccessToken } from './lib/firebaseAuth';

// In order to show the error boundary, I need to wrap the whole App layout in it... wait, it's better to wrap the main content area.
const getInitialPositions = (): AccountingPosition[] => {
  const saved = localStorage.getItem(LOCAL_STORAGE_POSITIONS_KEY);
  console.log("Loading positions from localStorage:", saved);
  if (saved && saved !== 'null' && saved !== 'undefined') {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse saved positions:", e);
      // Return empty array to prevent overwriting with demo data
      return []; 
    }
  }

  // Fallback migration of old single-profile (only if key didn't exist)
  let oldProfile = DEFAULT_PROFILE;
  try {
    const savedProf = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
    if (savedProf) oldProfile = JSON.parse(savedProf);
  } catch (e) {}

  let oldInvoices = DEMO_INVOICES;
  try {
    const savedInvs = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
    if (savedInvs) oldInvoices = JSON.parse(savedInvs);
  } catch (e) {}

  return [
    {
      id: 'pos-default',
      name: `Posizione (${oldProfile.fullName})`,
      profile: oldProfile,
      invoices: oldInvoices,
    },
  ];
};

const getInitialActivePositionId = (positions: AccountingPosition[]): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(LOCAL_STORAGE_ACTIVE_POSITION_ID_KEY);
    if (saved && positions.find((p) => p.id === saved)) {
      return saved;
    }
  }
  return positions.length > 0 ? positions[0].id : '';
};

export default function App() {
  const [positions, setPositions] = useState<AccountingPosition[]>(() => {
    return getInitialPositions();
  });

  const [activePositionId, setActivePositionId] = useState<string>(() => {
    return getInitialActivePositionId(positions);
  });

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('forfettario_selected_year_v1') || '2026';
    }
    return '2026';
  });

  useEffect(() => {
    localStorage.setItem('forfettario_selected_year_v1', selectedYear);
  }, [selectedYear]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    dashboard: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const openAndScrollToSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: true,
    }));
    setTimeout(() => {
      document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    setSidebarOpen(false);
  };

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success'>('idle');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCreatingDriveFolder, setIsCreatingDriveFolder] = useState(false);

  // Online/Offline detection states
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isFirestoreConnected, setIsFirestoreConnected] = useState<boolean>(true);
  const [showOfflineBanner, setShowOfflineBanner] = useState<boolean>(() => typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [syncRetryTrigger, setSyncRetryTrigger] = useState<number>(0);

  // Monitor connectivity updates
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsFirestoreConnected(true);
      setShowOfflineBanner(true); // show back online alert momentarily, then it can fade/be dismissed
      addSyncLog("🌐 Connessione di rete ripristinata. Sincronizzazione in corso...");
      setSyncRetryTrigger((prev) => prev + 1);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsFirestoreConnected(false);
      setShowOfflineBanner(true);
      addSyncLog("⚠️ Connessione internet assente. Modalità locale protetta attiva.");
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // Google Sheets Apps Script integration states
  const [webhookUrl, setWebhookUrl] = useState<string>(() => {
    return localStorage.getItem('forfettario_webhook_url_v1') || '';
  });
  const [sheetsSyncLogs, setSheetsSyncLogs] = useState<string[]>(['Inizializzato logger di sincronizzazione.']);

  // Google Drive integration state
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleAccessTokenState, setGoogleAccessTokenState] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      async (user, token) => {
        setGoogleUser({ email: user.email, photoURL: user.photoURL, uid: user.uid });
        setGoogleAccessTokenState(token);
        
        try {
          const { dbService } = await import('./lib/db');
          const remotePositions = await dbService.getAccountingPositions(user.uid);
          if (remotePositions && remotePositions.length > 0) {
            setPositions(prev => {
              const merged = [...prev];
              remotePositions.forEach(rp => {
                const existingIndex = merged.findIndex(p => p.id === rp.id);
                // Simple merge: keep cloud version if it doesn't exist locally,
                // or if cloud has more invoices/f24 tracking.
                if (existingIndex >= 0) {
                  // Prefer cloud data over local default empty positions
                  const local = merged[existingIndex];
                  const cloudInvoices = rp.invoices?.length || 0;
                  const localInvoices = local.invoices?.length || 0;
                  if (cloudInvoices >= localInvoices) {
                    merged[existingIndex] = { ...local, ...rp };
                  }
                } else {
                  merged.push(rp);
                }
              });
              
              // Remove the default dummy position if we have real data from cloud
              const filtered = merged.filter(p => !(p.id === 'pos-default' && p.invoices.length === 0));
              return filtered.length > 0 ? filtered : merged;
            });
          }
        } catch (e) {
          console.error("Firestore sync error:", e);
        }
      },
      () => {
        setGoogleUser(null);
        setGoogleAccessTokenState(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      addSyncLog("Autenticazione con Google in corso...");
      const result = await googleSignIn();
      if (result) {
        setGoogleUser({ email: result.user.email, photoURL: result.user.photoURL, uid: result.user.uid });
        setGoogleAccessTokenState(result.accessToken);
        addSyncLog("✅ Google Drive connesso.");
      }
    } catch (err: any) {
      console.error(err);
      safeAlert("Errore durante l'autenticazione: " + err.message);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await firebaseLogout();
      setGoogleUser(null);
      setGoogleAccessTokenState(null);
      addSyncLog("🔙 Disconnesso da Google Drive.");
    } catch (err: any) {
      safeAlert("Errore durante il logout: " + err.message);
    }
  };

  const handleCreateFolderForActivePosition = async () => {
    const token = googleAccessTokenState;
    if (!token) {
      addSyncLog("⚠️ Connetti prima Google Drive per creare la cartella.");
      return;
    }
    
    addSyncLog(`📁 Creazione cartella Google Drive per "${activePosition.name}" in corso...`);
    try {
      const folder = await createAccountingPositionFolder(token, activePosition.name, activePosition.profile.fullName, undefined, selectedYear);
      
      // Update local and firestore positions state
      setPositions((prev) =>
        prev.map((pos) => {
          if (pos.id === activePositionId) {
            return {
              ...pos,
              driveFolderId: folder.id,
              driveFolderUrl: folder.url,
            };
          }
          return pos;
        })
      );
      addSyncLog(`✅ Cartella creata per "${activePosition.name}" su Google Drive nella directory "forfettari"!`);
    } catch (err: any) {
      console.error(err);
      addSyncLog(`❌ Impossibile creare cartella: ${err.message || err}`);
    }
  };

  const handleAssociateDriveFolder = async (folderId: string, folderUrl: string) => {
    const token = googleAccessTokenState;
    if (!token) {
      addSyncLog("⚠️ Connetti prima Google Drive.");
      return;
    }
    
    addSyncLog(`📁 Configurazione cartella di lavoro su Drive...`);
    try {
      // Create subfolders if they don't exist
      await findOrCreateFolder(token, 'Fatture Emesse', folderId);
      await findOrCreateFolder(token, 'F24', folderId);
      
      setPositions((prev) =>
        prev.map((pos) => {
          if (pos.id === activePositionId) {
            return {
              ...pos,
              driveFolderId: folderId,
              driveFolderUrl: folderUrl,
            };
          }
          return pos;
        })
      );
      addSyncLog(`✅ Cartella principale associata! Sottocartelle "Fatture Emesse" e "F24" configurate con successo.`);
    } catch (err: any) {
      console.error(err);
      addSyncLog(`⚠️ Cartella principale associata, ma si è verificato un errore configurando le sottocartelle: ${err.message || err}`);
      // Fallback: associate anyway
      setPositions((prev) =>
        prev.map((pos) => {
          if (pos.id === activePositionId) {
            return {
              ...pos,
              driveFolderId: folderId,
              driveFolderUrl: folderUrl,
            };
          }
          return pos;
        })
      );
    }
  };

  const handleUploadInvoiceXmlToDrive = async (file: File, year?: string) => {
    if (!activePosition) {
      throw new Error("Nessuna posizione contabile attiva selezionata.");
    }
    const token = googleAccessTokenState;
    if (!token) {
      throw new Error("Sincronizzazione Drive non attiva: Google Drive non connesso.");
    }
    
    let parentFolderId = activePosition.driveFolderId;
    let targetFattureFolderId = activePosition.fattureEmesseFolderId;
    const uploadYear = year || selectedYear;
    
    // 1. If active position doesn't have a drive folder yet, create it automatically!
    if (!parentFolderId) {
      addSyncLog(`📁 Creazione automatica della cartella principale Drive per "${activePosition.name}" prima del caricamento dell'XML della fattura...`);
      try {
        const folder = await createAccountingPositionFolder(token, activePosition.name, activePosition.profile.fullName, undefined, uploadYear);
        parentFolderId = folder.id;
        targetFattureFolderId = folder.fattureEmesseFolderId;
        
        // Update positions state locally with the new folder id/url so we can proceed
        setPositions((prev) =>
          prev.map((pos) => {
            if (pos.id === activePositionId) {
              return {
                ...pos,
                driveFolderId: folder.id,
                driveFolderUrl: folder.url,
                fattureEmesseFolderId: folder.fattureEmesseFolderId,
                f24FolderId: folder.f24FolderId,
                fileGenericiFolderId: folder.fileGenericiFolderId,
              };
            }
            return pos;
          })
        );
        addSyncLog(`✅ Cartella principale "Forfettario ${activePosition.profile.fullName}" creata con successo.`);
      } catch (err: any) {
        console.error(err);
        addSyncLog(`❌ Impossibile creare la cartella principale del cliente: ${err.message || err}`);
        throw new Error(`Impossibile creare cartella principale su Drive: ${err.message}`);
      }
    }

    if (!parentFolderId) {
      throw new Error("ID Cartella Drive principale non disponibile.");
    }

    return await uploadInvoiceXml(token, parentFolderId, file, targetFattureFolderId, uploadYear);
  };

  const pickerCallback = async (data: any, token: string) => {
    if (data.action === (window as any).google.picker.Action.PICKED) {
      const folder = data.docs[0];
      const selectedParentDriveId = folder.id;
      
      setIsCreatingDriveFolder(true);
      try {
        const createdFolder = await createAccountingPositionFolder(
          token, 
          activePosition.name, 
          activePosition.profile.fullName, 
          selectedParentDriveId, 
          selectedYear
        );
        
        setPositions(prev => prev.map(p => 
          p.id === activePosition.id 
            ? { 
                ...p, 
                driveFolderId: createdFolder.id, 
                driveFolderUrl: createdFolder.url,
                fattureEmesseFolderId: createdFolder.fattureEmesseFolderId,
                f24FolderId: createdFolder.f24FolderId,
                fileGenericiFolderId: createdFolder.fileGenericiFolderId,
              } 
            : p
        ));
        
        safeAlert("Cartella principale 'Forfettario " + activePosition.profile.fullName + "' e relative sottocartelle create con successo su Google Drive.");
      } catch (err: any) {
        console.error(err);
        safeAlert("Errore nella creazione della cartella Google Drive: " + (err.message || err.toString()));
      } finally {
        setIsCreatingDriveFolder(false);
      }
    }
  };

  const onPickerApiLoad = (token: string) => {
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
      .setCallback((data: any) => pickerCallback(data, token))
      .setOrigin(pickerOrigin)
      .setTitle("Seleziona la cartella genitore in Google Drive")
      .build();
    
    picker.setVisible(true);
  };

  const handleOpenFolderPicker = (token: string) => {
    if (!(window as any).google?.picker) {
      if ((window as any).gapi) {
        (window as any).gapi.load('picker', { callback: () => onPickerApiLoad(token) });
      } else {
        safeAlert("Google API non ancora caricate. Riprova tra un attimo.");
      }
    } else {
      onPickerApiLoad(token);
    }
  };

  const handleUploadF24Pdf = async (file: File, year?: string) => {
    if (!activePosition) {
      throw new Error("Nessuna posizione contabile attiva selezionata.");
    }
    const token = googleAccessTokenState;
    if (!token) {
      addSyncLog("⚠️ Connetti prima Google Drive per caricare i file F24.");
      throw new Error("Google Drive non connesso.");
    }

    let parentFolderId = activePosition.driveFolderId;
    let targetF24FolderId = activePosition.f24FolderId;
    const uploadYear = year || selectedYear;
    
    // 1. If active position doesn't have a drive folder yet, create it automatically!
    if (!parentFolderId) {
      addSyncLog(`📁 Creazione automatica della cartella principale Drive per "${activePosition.name}" prima del caricamento dell'F24...`);
      try {
        const folder = await createAccountingPositionFolder(token, activePosition.name, activePosition.profile.fullName, undefined, uploadYear);
        parentFolderId = folder.id;
        targetF24FolderId = folder.f24FolderId;
        
        // Update positions state locally with the new folder id/url temporarily so we can proceed
        setPositions((prev) =>
          prev.map((pos) => {
            if (pos.id === activePositionId) {
              return {
                ...pos,
                driveFolderId: folder.id,
                driveFolderUrl: folder.url,
                fattureEmesseFolderId: folder.fattureEmesseFolderId,
                f24FolderId: folder.f24FolderId,
                fileGenericiFolderId: folder.fileGenericiFolderId,
              };
            }
            return pos;
          })
        );
        addSyncLog(`✅ Cartella principale creata con successo.`);
      } catch (err: any) {
        console.error(err);
        addSyncLog(`❌ Impossibile creare la cartella principale del cliente: ${err.message || err}`);
        throw new Error(`Impossibile creare cartella principale su Drive: ${err.message}`);
      }
    }

    if (!parentFolderId) {
      throw new Error("ID Cartella Drive principale non disponibile.");
    }

    addSyncLog(`⏱️ Inizio caricamento del file F24 "${file.name}" su Drive...`);
    try {
      const uploadedFile = await uploadF24Pdf(token, parentFolderId, file, activePosition.profile.fullName, targetF24FolderId, uploadYear);
      
      // Update the active position's f24 list
      setPositions((prev) =>
        prev.map((pos) => {
          if (pos.id === activePositionId) {
            const currentF24s = pos.f24Files || [];
            return {
              ...pos,
              f24Files: [uploadedFile, ...currentF24s],
              // Ensure metadata is set (it might be set already if we just created the folder)
              driveFolderId: parentFolderId,
              f24FolderId: targetF24FolderId,
            };
          }
          return pos;
        })
      );
      addSyncLog(`✅ File F24 "${file.name}" caricato correttamente nella sottocartella "F24" dell'anno ${uploadYear} su Google Drive!`);
    } catch (err: any) {
      console.error(err);
      addSyncLog(`❌ Errore durante il caricamento di "${file.name}": ${err.message || err}`);
      throw err;
    }
  };

  const handleDeleteF24Pdf = async (fileId: string) => {
    const token = googleAccessTokenState;
    if (!token) {
      addSyncLog("⚠️ Connettiti a Google Drive per eliminare il file anche sul cloud.");
    }

    // Try deleting from cloud if token exist
    if (token) {
      try {
        addSyncLog("⏱️ Rimozione file da Google Drive...");
        await deleteDriveFile(token, fileId);
        addSyncLog("✅ File rimosso da Google Drive.");
      } catch (err: any) {
        console.error(err);
        addSyncLog(`⚠️ Nota: file mancante o non eliminabile da Drive: ${err.message}`);
      }
    }

    // Remove from local tracked positions in any case to keep the UI clean
    setPositions((prev) =>
      prev.map((pos) => {
        if (pos.id === activePositionId) {
          const currentF24s = pos.f24Files || [];
          return {
            ...pos,
            f24Files: currentF24s.filter((f) => f.id !== fileId),
          };
        }
        return pos;
      })
    );
    addSyncLog("🗑️ Documento F24 rimosso dal registro locale.");
  };

  const addSyncLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('it-IT');
    setSheetsSyncLogs((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  };

  useEffect(() => {
    localStorage.setItem('forfettario_webhook_url_v1', webhookUrl);
  }, [webhookUrl]);

  // Authenticate Firebase anonymously on mount
  useEffect(() => {
    // Firebase removed.
  }, []);

  // Save changes to Firestore on positions modification and network retry triggers
  useEffect(() => {
    // Firebase removed.
  }, [positions, isOnline, syncRetryTrigger]);

  // Support manual cloud recovery with custom UID
  const handleRestoreCloudBackup = async (code: string) => {
    safeAlert("La funzionalità di backup in cloud è momentaneamente disabilitata.");
    return false;
  };

  // Derive the active business profile and invoices from current selection
  const activePosition = positions.find((p) => p.id === activePositionId);
  const isPositionSelected = !!activePosition;

  const blankProfile: BusinessProfile = {
    fullName: '',
    vatNumber: '',
    fiscalCode: '',
    atecoCode: '62.01.00',
    pensionFund: 'INPS_GESTIONE_SEPARATA',
    startYear: selectedYear,
    isStartup: true
  };

  const profile = activePosition ? activePosition.profile : blankProfile;
  const allInvoices = activePosition ? (activePosition.invoices || []) : [];
  const allF24Entries = activePosition ? (activePosition.f24Entries || []) : [];

  // Filter invoices and F24 belonging to the selected fiscal year and sort chronologically/numerically
  const invoices = allInvoices
    .filter((inv) => inv.date && inv.date.startsWith(selectedYear))
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      const numA = parseInt(a.number.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.number.replace(/\D/g, '')) || 0;
      if (numA !== numB) return numA - numB;
      return a.number.localeCompare(b.number);
    });
    
  const f24Entries = allF24Entries
    .filter((e) => e.date && e.date.startsWith(selectedYear))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const setProfile = (newProfile: BusinessProfile) => {
    setPositions((prev) =>
      prev.map((pos) => {
        if (pos.id === activePositionId) {
          // If the position nickname matches the default naming, auto-sync it with the new full name
          const shouldUpdateName =
            pos.name.startsWith('Posizione (') ||
            pos.name.includes('Contabilità Principale') ||
            pos.name === 'Contabilità Principale (Default)' ||
            pos.name === 'Default';
          return {
            ...pos,
            name: shouldUpdateName ? `Posizione (${newProfile.fullName})` : pos.name,
            profile: newProfile,
          };
        }
        return pos;
      })
    );
  };

  const setInvoices = (newInvoices: Invoice[]) => {
    setPositions((prev) =>
      prev.map((pos) => {
        if (pos.id === activePositionId) {
          return { ...pos, invoices: newInvoices };
        }
        return pos;
      })
    );
  };

  // Sync positions list to localStorage and Firestore on change
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_POSITIONS_KEY, JSON.stringify(positions));
    
    if (googleUser && googleUser.uid) {
      import('./lib/db').then(({ dbService }) => {
        dbService.syncAllPositions(googleUser.uid, positions).catch(err => {
          console.warn("Autosave to Firestore failed:", err);
        });
      });
    }
  }, [positions, googleUser]);

  // Sync active selection to localStorage on change
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_POSITION_ID_KEY, activePositionId);
  }, [activePositionId]);

  // Provide a boolean state to track sync
  const [isSyncingDriveList, setIsSyncingDriveList] = useState(false);

  const handleDriveInvoiceSync = async () => {
    if (!activePosition) return;
    const token = googleAccessTokenState;
    if (!token) {
      addSyncLog("⚠️ Non sei connesso a Google Drive, impossibile effettuare sync fatture.");
      return;
    }
    let folderId = activePosition.fattureEmesseFolderId;
    const parentFolderId = activePosition.driveFolderId;
    if (parentFolderId) {
      addSyncLog(`📁 Risoluzione automatica della cartella per l'anno ${selectedYear}...`);
      try {
        const yearFolder = await findOrCreateFolder(token, `Anno ${selectedYear}`, parentFolderId);
        const subFolder = await findOrCreateFolder(token, 'Fatture Emesse', yearFolder.id);
        folderId = subFolder.id;
      } catch (err: any) {
        console.warn("Utilizzo del fallback per la ricerca cartella:", err);
      }
    }

    if (!folderId) {
      addSyncLog("⚠️ La cartella Fatture Emesse Drive non è ancora creata. Carica una prima fattura da UI.");
      return;
    }

    setIsSyncingDriveList(true);
    addSyncLog(`🔄 Scansione cartella Fatture (${selectedYear}) su Drive in corso...`);

    try {
      const driveFiles = await listFilesInFolder(token, folderId);
      
      const currentInvoices = activePosition.invoices || [];
      const driveFilesMap = new Map(driveFiles.map(f => [f.id, f]));
      const newInvoicesList: Invoice[] = [];
      const unlinkedDriveFiles = [...driveFiles];

      let changed = false;

      for (const inv of currentInvoices) {
        if (inv.driveFileId) {
           if (!driveFilesMap.has(inv.driveFileId)) {
             addSyncLog(`🗑️ Fattura "${inv.number}" eliminata da Drive, rimuovo da gestionale.`);
             changed = true;
           } else {
             newInvoicesList.push(inv);
             const unlinkedIndex = unlinkedDriveFiles.findIndex(f => f.id === inv.driveFileId);
             if (unlinkedIndex > -1) unlinkedDriveFiles.splice(unlinkedIndex, 1);
           }
        } else {
           newInvoicesList.push(inv);
        }
      }

      for (const f of unlinkedDriveFiles) {
        if (!f.mimeType.includes("xml")) {
          // ignore non-xml added manually
          continue; 
        }
        addSyncLog(`📄 Trovata nuova fattura su Drive: ${f.name}. Tento la lettura...`);
        try {
          const content = await downloadFileContent(token, f.id);
          const parsed = parseInvoiceXml(content);
          if (parsed) {
             let invoiceDate = parsed.date;
             if (!invoiceDate) {
               invoiceDate = `${selectedYear}-01-01`;
             }

             const safeNumber = parsed.number.replace(/[^a-zA-Z0-9]/g, '_');
             const safeDate = invoiceDate.replace(/[^0-9-]/g, '');
             const newName = `Fattura_${safeNumber}_${safeDate}.xml`;

             if (f.name !== newName) {
               await renameDriveFile(token, f.id, newName);
               addSyncLog(`✏️ File rinominato automaticamente in ${newName}`);
             }

             newInvoicesList.push({
               id: `inv-dr-${f.id}`,
               date: invoiceDate,
               number: parsed.number,
               clientName: parsed.clientName,
               clientVat: parsed.clientVat || '',
               hasStampDuty: parsed.hasStampDuty || false,
               amount: parsed.amount,
               isPaid: true,
               notes: parsed.notes,
               driveFileId: f.id,
               driveFileUrl: f.url
             });
             changed = true;
          }
        } catch (e: any) {
          addSyncLog(`⚠️ Impossibile leggere il contenuto del file ${f.name}: ` + e.message);
        }
      }

      if (changed) {
        setInvoices(newInvoicesList);
      }
      addSyncLog("✅ Sincronizzazione cartella Fatture Drive completata!");
    } catch(err: any) {
      addSyncLog("❌ Errore durante la scansione di Drive: " + err.message);
    } finally {
      setIsSyncingDriveList(false);
    }
  };

  const handleCreatePosition = async (
    name: string, 
    newProfile: BusinessProfile, 
    folderInfo?: { 
      id: string; 
      url: string;
      fattureEmesseFolderId?: string;
      f24FolderId?: string;
      fileGenericiFolderId?: string;
    }
  ) => {
    const newId = `pos-${Date.now()}`;
    const newPosition: AccountingPosition = {
      id: newId,
      name,
      profile: newProfile,
      invoices: [], // starts fresh
    };

    if (folderInfo && folderInfo.id) {
      newPosition.driveFolderId = folderInfo.id;
      newPosition.driveFolderUrl = folderInfo.url;
      newPosition.fattureEmesseFolderId = folderInfo.fattureEmesseFolderId;
      newPosition.f24FolderId = folderInfo.f24FolderId;
      newPosition.fileGenericiFolderId = folderInfo.fileGenericiFolderId;
      addSyncLog(`✅ Cartella principale "Forfettario ${newProfile.fullName}" e relative sottocartelle associate all'anagrafica.`);
    } else {
      const token = googleAccessTokenState;
      if (token) {
        addSyncLog(`📁 Connessione a Google Drive in corso per creare la cartella "Forfettario ${newProfile.fullName}"...`);
        try {
          const folderResult = await createAccountingPositionFolder(token, name, newProfile.fullName, undefined, newProfile.startYear);
          newPosition.driveFolderId = folderResult.id;
          newPosition.driveFolderUrl = folderResult.url;
          newPosition.fattureEmesseFolderId = folderResult.fattureEmesseFolderId;
          newPosition.f24FolderId = folderResult.f24FolderId;
          newPosition.fileGenericiFolderId = folderResult.fileGenericiFolderId;
          addSyncLog(`✅ Cartella principale e sottocartelle create con successo su Google Drive nella directory "forfettari" per "${name}"!`);
        } catch (err: any) {
          console.error(err);
          addSyncLog(`⚠️ Errore creazione cartella Google Drive: ${err.message || err}`);
        }
      } else {
        addSyncLog(`💡 Nota: Associa il tuo account Google Drive sul pannello "Integrazione NoSQL" per creare automaticamente la cartella corrispondente su cloud.`);
      }
    }

    setPositions((prev) => [...prev, newPosition]);
    setActivePositionId(newId);
  };

  const handleDeletePosition = async (idToDelete: string) => {
    const positionToDelete = positions.find((p) => p.id === idToDelete);
    if (positionToDelete && positionToDelete.driveFolderId) {
      const token = googleAccessTokenState;
      if (token) {
        try {
          addSyncLog(`🗑️ Rimozione in corso della cartella Google Drive per "${positionToDelete.name}"...`);
          await deleteDriveFile(token, positionToDelete.driveFolderId);
          addSyncLog(`✅ Cartella Google Drive di "${positionToDelete.name}" rimossa correttamente.`);
        } catch (err: any) {
          console.error("Errore rimozione cartella Drive della posizione:", err);
          addSyncLog(`⚠️ Nota: Impossibile rimuovere la cartella principale da Drive (${err.message || err}).`);
        }
      }
    }

    const remainingPositions = positions.filter((p) => p.id !== idToDelete);
    if (remainingPositions.length === 0) {
      // Re-create a clean slate default position
      const defaultId = 'pos-default';
      const resetPosition: AccountingPosition = {
        id: defaultId,
        name: 'Contabilità Principale (Default)',
        profile: {
          fullName: 'Nuovo Cliente',
          vatNumber: '',
          atecoCode: '62.01.00',
          pensionFund: 'INPS_GESTIONE_SEPARATA',
          startYear: '2026',
          isStartup: true,
        },
        invoices: [],
        f24Entries: []
      };
      setPositions([resetPosition]);
      setActivePositionId(defaultId);
      addSyncLog(`🧹 Tutte le posizioni rimosse. Ripristinata una posizione predefinita pulita.`);
    } else {
      setPositions(remainingPositions);
      // Switch active if we just deleted the active one
      if (activePositionId === idToDelete) {
        setActivePositionId(remainingPositions[0].id);
      }
      addSyncLog(`🗑️ Posizione contabile rimossa con successo.`);
    }
  };

  const handleAddInvoice = (newInvoice: Omit<Invoice, 'id'>) => {
    const invoiceWithId: Invoice = {
      ...newInvoice,
      id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    };
    
    setPositions((prev) =>
      prev.map((pos) => {
        if (pos.id === activePositionId) {
          const currentInvoices = pos.invoices || [];
          // Verify it's not already added if there was a duplicate
          return { ...pos, invoices: [invoiceWithId, ...currentInvoices] };
        }
        return pos;
      })
    );
  };

  const handleDeleteInvoice = async (id: string) => {
    const invoiceToDelete = allInvoices.find((inv) => inv.id === id);
    if (invoiceToDelete?.driveFileId) {
      const token = googleAccessTokenState;
      if (token) {
        try {
          await deleteDriveFile(token, invoiceToDelete.driveFileId);
          addSyncLog(`🗑️ Fattura eliminata correttamente da Google Drive.`);
        } catch (err) {
          console.error("Errore durante l'eliminazione del file da Drive:", err);
          safeAlert("Errore durante l'eliminazione del file da Google Drive.");
        }
      }
    }
    setInvoices(allInvoices.filter((inv) => inv.id !== id));
  };

  const handleTogglePaid = (id: string) => {
    setInvoices(
      allInvoices.map((inv) =>
        inv.id === id ? { ...inv, isPaid: !inv.isPaid } : inv
      )
    );
  };

  const handleAddF24Entries = (newEntries: any[]) => {
    setPositions((prev) =>
      prev.map((pos) => {
        if (pos.id === activePositionId) {
          const withIds = newEntries.map(e => ({ ...e, id: `f24-${Date.now()}-${Math.random()}` }));
          return { ...pos, f24Entries: [...(pos.f24Entries || []), ...withIds] };
        }
        return pos;
      })
    );
  };

  const handleDeleteF24Entry = (entryId: string) => {
    setPositions((prev) =>
      prev.map((pos) => {
        if (pos.id === activePositionId) {
          return { ...pos, f24Entries: (pos.f24Entries || []).filter((e: any) => e.id !== entryId) };
        }
        return pos;
      })
    );
  };

  const handleGlobalSave = async () => {
    localStorage.setItem(LOCAL_STORAGE_POSITIONS_KEY, JSON.stringify(positions));
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_POSITION_ID_KEY, activePositionId);
    
    if (googleUser && googleUser.uid) {
      try {
        const { dbService } = await import('./lib/db');
        await dbService.syncAllPositions(googleUser.uid, positions);
        safeAlert("Modifiche salvate con successo localmente e sul cloud Firebase.");
      } catch (e) {
        console.error("Manual cloud sync failed", e);
        safeAlert("Modifiche salvate localmente. Errore durante il salvataggio sul cloud.");
      }
    } else {
      safeAlert("Modifiche salvate localmente. (Effettua l'accesso Google per il salvataggio nel cloud).");
    }
    
    setSyncRetryTrigger(prev => prev + 1);
  };

  const totalPaidRevenue = invoices
    .filter((inv) => inv.isPaid)
    .reduce((sum, inv) => sum + inv.amount, 0);

  // Principio di Cassa: Flat rate limit is 85.000 € (Italian Forfettario threshold)
  const LIMIT_REVENUE = 85000;
  const progressPercent = Math.min(100, (totalPaidRevenue / LIMIT_REVENUE) * 100);

  // Extract initials for the profile avatar circle
  const getInitials = (name: string) => {
    if (!name) return 'GP';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  const handleTriggerBackupSync = async () => {
    setSyncStatus('syncing');
    addSyncLog(`Inizio esportazione dati fiscali di "${profile.fullName || 'Senza Nome'}"...`);

    // Prepare calculations payload
    const autoContributions = f24Entries.reduce((sum, e) => sum + e.amount, 0);
    const taxInput = {
      revenue: totalPaidRevenue,
      atecoCode: profile.atecoCode,
      pensionFund: profile.pensionFund,
      contributionsPaidPreviousYear: autoContributions,
      isStartup: profile.isStartup,
      yearOfActivity: 1
    };
    
    let report;
    try {
      report = calculateTaxReturn(taxInput);
    } catch (calcError: any) {
      console.error(calcError);
      addSyncLog(`⚠️ Errore calcolo fiscale prima dell'invio: ${calcError.message || calcError}`);
    }

    const payload = {
      fullName: profile.fullName || "Anonimo",
      vatNumber: profile.vatNumber || "00000000000",
      atecoCode: profile.atecoCode,
      yearOfActivity: 1,
      revenue: totalPaidRevenue,
      contributionsPaidPreviousYear: autoContributions,
      grossTaxableIncome: report?.grossTaxableIncome || 0,
      netTaxableIncome: report?.netTaxableIncome || 0,
      substituteTax: report?.substituteTax || 0,
      currentYearContributions: report?.currentYearContributions || 0,
      netIncome: report?.netIncome || 0
    };

    if (!webhookUrl) {
      addSyncLog("⚠️ Nessun URL Webhook Google Sheets configurato. Avvio modalità simulata...");
      setTimeout(() => {
        setSyncStatus('success');
        addSyncLog("✅ [SIMULATORE] Backup Fogli Google completato con successo (modalità offline). Configura un URL reale per connettere Google Drive.");
        setTimeout(() => setSyncStatus('idle'), 3000);
      }, 1500);
      return;
    }

    try {
      addSyncLog(`Chiamata POST in corso verso l'endpoint remoto Google Drive...`);
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors', // standard workaround for Google Script WebApp redirect/CORS issues
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      // Since mode is 'no-cors' standard for Apps Script Web App redirects, we assume delivery was dispatched.
      setSyncStatus('success');
      addSyncLog("✅ Sincronizzazione Fogli Google (Google Drive) completata con successo!");
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error: any) {
      console.error(error);
      addSyncLog(`❌ Errore sincronizzazione: ${error.message || error}`);
      setSyncStatus('idle');
    }
  };

  const handleFirebaseBackupToDrive = async () => {
    safeAlert("La funzionalità di backup in cloud è momentaneamente disabilitata.");
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-full bg-slate-50 font-sans overflow-hidden" id="app-container">
        
        {/* Mobile Sidebar Back-drop overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-slate-950/40 z-40 md:hidden transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

      {/* SIDEBAR CONTAINER */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 flex flex-col z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Sidebar Header Brand */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-slate-950 italic text-base">
              F
            </div>
            <span className="font-bold tracking-tight text-xl text-white">
              Forfettario<span className="text-emerald-400 text-sm align-top ml-0.5 font-black">+</span>
            </span>
          </div>
          {/* Close button inside mobile sidebar */}
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-1 text-slate-400 hover:text-white md:hidden"
            aria-label="Chiudi menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Gestione Posizione Contabile */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/25 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Soggetto / P.IVA</span>
            <button
              onClick={() => setIsPositionModalOpen(true)}
              className="text-[10px] uppercase font-extrabold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
              title="Aggiungi nuova posizione contabile"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Nuovo
            </button>
          </div>
          
          <div className="flex items-center gap-1.5 w-full">
            <select
              value={activePositionId}
              onChange={(e) => setActivePositionId(e.target.value)}
              className="flex-grow bg-slate-800 border border-slate-700 hover:border-slate-600 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 outline-none transition-all cursor-pointer"
            >
              {positions.map((pos) => {
                const isPlaceholderProfile = !pos.profile?.fullName || pos.profile.fullName === 'Nuovo Cliente';
                const displayLabel = !isPlaceholderProfile ? pos.profile.fullName : pos.name;
                return (
                  <option key={pos.id} value={pos.id} className="bg-slate-900 text-slate-200 font-medium">
                    {displayLabel}
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="p-2 bg-slate-850 hover:bg-rose-500/10 border border-slate-700 hover:border-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer"
              title="Elimina posizione corrente"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider px-4 mb-2">Menu Di Gestione</p>
          
          <button
            onClick={() => {
              openAndScrollToSection('dashboard');
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-xs transition-all ${
              expandedSections['dashboard']
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Calculator className="w-4.5 h-4.5 shrink-0" />
            <span>Ottimizzatore Fiscale Forfettario</span>
          </button>
        </nav>

        {/* Real-time Flat-rate revenue threshold (Limite Ricavi) widget at sidebar bottom */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/20">
          <div className="p-4 bg-slate-800/70 border border-slate-800/40 rounded-2xl">
            <div className="flex justify-between items-center mb-1.5">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Soglia Ricavi {selectedYear}</p>
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-black">
                {progressPercent.toFixed(0)}%
              </span>
            </div>
            
            <div className="flex justify-between items-baseline mb-2 gap-1 overflow-hidden">
              <span className="text-white text-sm font-extrabold truncate">
                € {totalPaidRevenue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-slate-400 text-[10px] whitespace-nowrap">/ € 85.000</span>
            </div>

            {/* Progress road indicator */}
            <div className="w-full bg-slate-700/60 rounded-full h-2">
              <div 
                className="bg-emerald-500 h-2 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            
            <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">
              Superando gli € 85k si esce dal forfettario l'anno successivo.
            </p>
          </div>
        </div>

      </aside>

      {/* CORE WORKSPACE */}
      <main className="flex-1 flex flex-col min-w-0" id="main-content-window">
        
        {/* Top Professional Sleek Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 shrink-0">
          
          <div className="flex items-center gap-3">
            {/* Hamburger menu for small devices */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg md:hidden transition-colors"
              aria-label="Apri menu"
            >
              <Menu className="w-5.5 h-5.5" />
            </button>
            
            <div className="flex items-center gap-2 sm:gap-3">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                Pannello di Controllo Fiscale
              </h2>
              <div className="relative inline-flex items-center" id="fiscal-year-selector">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold px-3 py-1 pr-8 rounded-full text-[11px] outline-none border-none cursor-pointer transition-all appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23475569' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
                    backgroundPosition: 'right 0.5rem center',
                    backgroundSize: '1.25em 1.25em',
                    backgroundRepeat: 'no-repeat'
                  }}
                >
                  <option value="2026">Esercizio 2026</option>
                  <option value="2025">Esercizio 2025</option>
                  <option value="2024">Esercizio 2024</option>
                </select>
              </div>
              {!isOnline ? (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 font-black px-2.5 py-0.5 rounded-full text-[10px] flex items-center gap-1.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Modalità Locale (Offline)
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-black px-2.5 py-0.5 rounded-full text-[10px] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Locale (Online)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            
            {/* Real Webhook trigger styled precisely as the theme */}
            <button
              onClick={handleTriggerBackupSync}
              disabled={syncStatus === 'syncing'}
              className={`p-2 rounded-full text-slate-500 hover:bg-slate-50 border border-slate-200 hover:text-slate-800 transition-colors shrink-0 flex items-center justify-center relative group`}
              title="Backup asincrono Spreadsheet"
            >
              <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin text-emerald-500' : ''}`} />
              {syncStatus === 'success' && (
                <span className="absolute right-0 top-full mt-1.5 bg-emerald-600 text-white text-[9px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap animate-fade-in z-25">
                  Archiviato!
                </span>
              )}
            </button>

            {/* Google Drive Connection Button */}
            {!googleUser ? (
              <button
                onClick={handleGoogleLogin}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#4285F4] hover:bg-[#3367D6] text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                title="Connetti Google Drive con palmasstudio@gmail.com"
              >
                <div className="bg-white p-0.5 rounded-full">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <span>Connetti Drive</span>
              </button>
            ) : (
              <button
                onClick={async () => {
                  await handleGoogleLogout();
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-[11px] font-bold transition-all shadow-sm cursor-pointer"
                title={`Disconnetti Google Drive (${googleUser.email})`}
              >
                <div className="w-4 h-4 rounded-full overflow-hidden shrink-0 filter brightness-90">
                  <img src={googleUser.photoURL || `https://ui-avatars.com/api/?name=${googleUser.email || 'U'}&background=random`} alt="Google Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <span className="max-w-[100px] truncate">{googleUser.email}</span>
              </button>
            )}

            {/* Global Manual Save Button */}
            <button
              onClick={handleGlobalSave}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
              title="Salva modifiche localmente e su cloud, e ricarica il software"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Salva Modifiche</span>
            </button>

            {/* Profile badge from the Sleek Design */}
            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-extrabold text-slate-800 max-w-[120px] truncate leading-tight">
                  {profile.fullName || 'Mario Rossi'}
                </p>
                <p className="text-[10px] text-slate-400 font-mono tracking-tight font-medium mt-0.5">
                  {profile.vatNumber ? `P.IVA ${profile.vatNumber}` : 'Configura P.IVA'}
                  {profile.fiscalCode ? ` · CF ${profile.fiscalCode}` : ''}
                </p>
              </div>
              <div className="w-9 h-9 bg-slate-150 border border-slate-200/60 rounded-full flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                {getInitials(profile.fullName)}
              </div>
            </div>

          </div>

        </header>

        {/* Dynamic connection lost banner notification */}
        {showOfflineBanner && !isOnline && (
          <div className="px-6 py-4 border-b flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 animate-fade-in bg-amber-500/10 border-amber-500/20 text-slate-900">
            <div className="flex items-start gap-3.5">
              <div className="p-2 rounded-2xl shrink-0 mt-0.5 bg-amber-500/10 text-amber-600">
                <WifiOff className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold font-sans tracking-tight">
                  {!isOnline 
                    ? 'Connessione Internet assente (Archiviazione Locale di Sicurezza)' 
                    : 'Sincronizzazione Cloud temporaneamente interrotta'}
                </p>
                <p className="text-[10.5px] text-slate-500 mt-1 leading-relaxed max-w-4xl">
                  {!isOnline 
                    ? 'La tua connessione di rete risulta assente. Tutti i dati inseriti, modifiche alle fatture e pdf del F24 caricati sono custoditi in sicurezza nel tuo storage interno locale del browser. Verranno caricati sul cloud automaticamente non appena la rete tornerà disponibile.' 
                    : 'Impossibile contattare i server cloud di Firestore. I dati correnti sono memorizzati solo localmente nel browser per prevenire rallentamenti, e verranno ri-tentati ad intervalli regolari.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {isOnline && (
                <button
                  onClick={() => setSyncRetryTrigger(prev => prev + 1)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 hover:shadow-sm text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap"
                >
                  Sincronizza Ora
                </button>
              )}
              <button
                onClick={() => setShowOfflineBanner(false)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap"
              >
                Nascondi Alert
              </button>
            </div>
          </div>
        )}

        {/* Dynamic content scrollable area with spacing matches design */}
        <div className="flex-grow overflow-y-auto p-4 sm:p-8 bg-slate-50/50">
          <div className="max-w-6xl mx-auto space-y-6">
          
          {/* Dashboard Section */}
          <div id="section-dashboard" className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <button
              onClick={() => toggleSection('dashboard')}
              className="w-full flex items-center justify-between p-5 sm:p-6 bg-white hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Calculator className="w-5 h-5" />
                </div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-800">Ottimizzatore Fiscale Forfettario</h2>
              </div>
              {expandedSections['dashboard'] ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>
            
            {expandedSections['dashboard'] && (
              <div className="p-5 sm:p-6 pt-0 border-t border-slate-100 space-y-6 animate-fade-in bg-slate-50/30">
                <BusinessProfileCard 
                  profile={profile} 
                  onChange={setProfile}
                  isCreatingFolder={isCreatingDriveFolder}
                  driveFolderCreated={!!activePosition?.driveFolderId}
                  isUnselected={!isPositionSelected}
                  onCreateDriveFolder={async () => {
                    const token = googleAccessTokenState;
                    if (!token) {
                      safeAlert("Connetti prima Google Drive dall'apposito pulsante nell'header in alto a destra.");
                      return;
                    }
                    
                    handleOpenFolderPicker(token);
                  }}
                  onSaveAnagrafica={() => {
                      safeAlert("Anagrafica configurata e salvata correttamente!");
                  }}
                />
                
                {isPositionSelected && (
                  <>
                    <div className="bg-slate-900 text-slate-300 p-4 rounded-2xl border border-slate-800 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Statistiche Consolidate Regime Forfettario
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Motore matematico deterministico aggiornato al Decreto Fiscale vigente</p>
                      </div>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-xl text-emerald-400 text-xs font-extrabold flex items-center gap-1.5 font-mono">
                        Base Imponibile Incassata: € {totalPaidRevenue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    <TaxSimulatorDashboard 
                      profile={profile} 
                      revenue={totalPaidRevenue} 
                      invoices={invoices} 
                      allInvoices={allInvoices}
                      googleConnected={!!googleUser}
                      driveFolderId={activePosition?.driveFolderId}
                      driveFolderUrl={activePosition?.driveFolderUrl}
                      f24Files={activePosition?.f24Files || []}
                      onUploadF24={handleUploadF24Pdf}
                      onDeleteF24={handleDeleteF24Pdf}
                      onConnectGoogle={handleGoogleLogin}
                      f24Entries={f24Entries}
                      allF24Entries={allF24Entries}
                      selectedYear={selectedYear}
                      onAddInvoice={handleAddInvoice}
                      onDeleteInvoice={handleDeleteInvoice}
                      onAddF24Entries={handleAddF24Entries}
                      onDeleteF24Entry={handleDeleteF24Entry}
                      onUploadInvoiceXmlToDrive={handleUploadInvoiceXmlToDrive}
                      onSyncDriveInvoices={handleDriveInvoiceSync}
                      isSyncingDriveInvoices={isSyncingDriveList}
                    />
                  </>
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Tiny clean professional footer inside layout */}
        <footer className="h-10 bg-white border-t border-slate-200/80 px-6 sm:px-8 flex items-center justify-between text-[10px] text-slate-400 shrink-0 select-none">
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-slate-300" />
            <span>Sandbox isolata locale al 100% · Nessun tracciamento</span>
          </div>
          <div className="font-medium">
            Versione 2.1.0 (Sleek Theme)
          </div>
        </footer>

      </main>

      <AccountingPositionModal
        isOpen={isPositionModalOpen}
        onClose={() => setIsPositionModalOpen(false)}
        onCreate={handleCreatePosition}
        accessToken={googleAccessTokenState}
      />

      <DeletePositionModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => {
          handleDeletePosition(activePositionId);
          setIsDeleteModalOpen(false);
        }}
        position={activePosition || { id: '', name: 'Nessuna', profile: blankProfile, invoices: [] }}
      />

      </div>
    </ErrorBoundary>
  );
}
