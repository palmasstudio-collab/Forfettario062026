/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility functions to interact with Google Drive API v3.
 */

import { AccountingPosition, Invoice, F24Entry, BusinessProfile } from '../types';
import { parseInvoiceXml } from './xmlInvoiceParser';

export interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
  mimeType?: string;
  url?: string;
}

// ID Fisso richiesto per la root cartella "forfettari" (ALTRO-FORFETTARIO MAROS VALERIA)
export const FORFETTARI_ROOT_FOLDER_ID = '19oSp4--stkguC2r25d2MfsV3PWUoVXfT';
// ID Fisso richiesto per la cartella di backup in JSON "cartella backup Firebase"
export const FIREBASE_BACKUP_FOLDER_ID = '13X4iMZ9Z1rF4s-vVz4GVs3MZaPhTegMv';

/**
 * Ensures a folder exists under targetParentId. 
 * Performs strict exact-match lookup and handles permission fallback to 'root'.
 */
export async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentId?: string
): Promise<{ id: string; name: string; webViewLink?: string; url?: string }> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const targetParent = parentId && parentId.trim() !== '' ? parentId.trim() : FORFETTARI_ROOT_FOLDER_ID;
  const targetLower = folderName.trim().toLowerCase();

  // 1. Strict Exact-Name Search in specific parent folder
  const query = `'${targetParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    const files = searchData.files || [];

    // Enforce STRICT exact name match only
    const exactMatch = files.find((f: any) => f.name.trim().toLowerCase() === targetLower);
    if (exactMatch) {
      return {
        id: exactMatch.id,
        name: exactMatch.name,
        webViewLink: exactMatch.webViewLink,
        url: exactMatch.webViewLink || `https://drive.google.com/drive/folders/${exactMatch.id}`
      };
    }
  } else if (searchRes.status !== 403 && searchRes.status !== 404) {
    const errText = await searchRes.text();
    console.error(`[Drive API Error ${searchRes.status}] List folders failed:`, errText);
    throw new Error(`Google Drive Search Failed (${searchRes.status}): ${errText}`);
  }

  // 2. Attempt Folder Creation in Target Parent
  const createUrl = 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true';
  let createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [targetParent],
    }),
  });

  // 3. Fallback: If HTTP 403 (Forbidden) or 404 (Not Found), create in User's Root Drive
  if (createRes.status === 403 || createRes.status === 404) {
    console.warn(`[Drive Permission Fallback] No write access to parent ${targetParent}. Creating under user 'root'.`);
    createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['root'],
      }),
    });
  }

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error(`[Drive API Fatal Error ${createRes.status}] Creation failed:`, errText);
    throw new Error(`Impossibile creare la cartella su Drive (${createRes.status}). Verifica i permessi.`);
  }

  const createdFolder = await createRes.json();
  return {
    id: createdFolder.id,
    name: createdFolder.name,
    webViewLink: createdFolder.webViewLink,
    url: createdFolder.webViewLink || `https://drive.google.com/drive/folders/${createdFolder.id}`
  };
}

/**
 * Resolves the nested folder structure for a given fiscal year.
 * Searches for exact folder names e.g. 'Anno 2026', and finds subfolders ('Fatture Emesse', 'F24', 'File Generici').
 */
export async function resolveYearFolderAndSubfolder(
  accessToken: string,
  parentFolderId: string,
  selectedYear: string,
  subfolderName: string,
  autoCreate: boolean = true
): Promise<{ yearFolderId: string; subfolderId: string }> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const targetParent = parentFolderId && parentFolderId.trim() !== '' ? parentFolderId.trim() : FORFETTARI_ROOT_FOLDER_ID;
  const yearFolderName = `Anno ${selectedYear}`;

  let yearFolder: { id: string; name: string };

  if (autoCreate) {
    yearFolder = await findOrCreateFolder(accessToken, yearFolderName, targetParent);
  } else {
    const query = `'${targetParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Drive Search Failed (${res.status}): ${errText}`);
    }
    const data = await res.json();
    const files: DriveFile[] = data.files || [];
    const matched = files.find(f => f.name.trim().toLowerCase() === yearFolderName.toLowerCase() || f.name.includes(selectedYear));
    if (matched) {
      yearFolder = matched;
    } else {
      return { yearFolderId: targetParent, subfolderId: targetParent };
    }
  }

  let subfolder: { id: string; name: string };
  if (autoCreate) {
    subfolder = await findOrCreateFolder(accessToken, subfolderName, yearFolder.id);
  } else {
    const query = `'${yearFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Drive Subfolder Search Failed (${res.status}): ${errText}`);
    }
    const data = await res.json();
    const files: DriveFile[] = data.files || [];
    const matched = files.find(f => f.name.trim().toLowerCase() === subfolderName.trim().toLowerCase());
    if (matched) {
      subfolder = matched;
    } else {
      subfolder = yearFolder;
    }
  }

  return { yearFolderId: yearFolder.id, subfolderId: subfolder.id };
}

/**
 * Uploads a PDF file to a dedicated folder inside the specified accounting position folder on Google Drive.
 */
export async function uploadF24Pdf(
  accessToken: string,
  parentPositionFolderId: string,
  file: File,
  clientName?: string,
  customF24FolderId?: string,
  year?: string
): Promise<{ name: string; id: string; url: string; dateAdded: string }> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const targetParent = parentPositionFolderId && parentPositionFolderId.trim() !== '' ? parentPositionFolderId.trim() : FORFETTARI_ROOT_FOLDER_ID;

  let f24FolderId = '';
  if (customF24FolderId && customF24FolderId.trim() !== '') {
    f24FolderId = customF24FolderId;
  } else if (year) {
    const resolved = await resolveYearFolderAndSubfolder(accessToken, targetParent, year, 'F24', true);
    f24FolderId = resolved.subfolderId;
  } else {
    f24FolderId = (await findOrCreateFolder(accessToken, 'F24', targetParent)).id;
  }

  const safeDate = new Date().toISOString().split('T')[0];
  const safeClientName = clientName ? clientName.replace(/[^a-zA-Z0-9\s]/g, '').trim() : 'Cliente';
  const formattedName = `F24_${safeClientName}_${safeDate}_${file.name}`;

  const metadataUrl = 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true';
  let metadataRes = await fetch(metadataUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: formattedName,
      mimeType: 'application/pdf',
      parents: [f24FolderId],
    }),
  });

  if (metadataRes.status === 403 || metadataRes.status === 404) {
    console.warn(`[Drive Permission Fallback] No write access to folder ${f24FolderId}. Uploading to 'root'.`);
    metadataRes = await fetch(metadataUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: formattedName,
        mimeType: 'application/pdf',
        parents: ['root'],
      }),
    });
  }

  if (!metadataRes.ok) {
    const errText = await metadataRes.text();
    throw new Error(`Impossibile creare il file F24 su Drive (${metadataRes.status}): ${errText}`);
  }

  const metadata = await metadataRes.json();
  const fileId = metadata.id;

  const mediaUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`;
  const mediaRes = await fetch(mediaUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/pdf',
    },
    body: file,
  });

  if (!mediaRes.ok) {
    const errText = await mediaRes.text();
    throw new Error(`Caricamento PDF F24 fallito (${mediaRes.status}): ${errText}`);
  }

  return {
    name: metadata.name || file.name,
    id: fileId,
    url: metadata.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    dateAdded: new Date().toISOString().split('T')[0],
  };
}

export interface CreatedFolderResult {
  id: string;
  url: string;
  fattureEmesseFolderId: string;
  f24FolderId: string;
  fileGenericiFolderId: string;
}

/**
 * Creates a dedicated subfolder nested under the specified parent folder on Google Drive.
 */
export async function createAccountingPositionFolder(
  accessToken: string,
  positionName: string,
  clientFullName: string,
  customParentId: string | undefined,
  year: string,
  startYear?: string
): Promise<CreatedFolderResult> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const targetParentId = customParentId && customParentId.trim() !== '' ? customParentId.trim() : FORFETTARI_ROOT_FOLDER_ID;
  const parent = targetParentId;

  const cleanedFullName = clientFullName.trim();
  const finalFolderTitle = `Forfettario ${cleanedFullName || positionName.trim() || 'Senza Nome'}`;
  const childFolder = await findOrCreateFolder(accessToken, finalFolderTitle, parent);

  const currentYearNum = new Date().getFullYear();
  const startYearNum = Math.min(
    parseInt(startYear || year || '2025', 10) || 2025,
    currentYearNum
  );
  const endYearNum = Math.max(currentYearNum, parseInt(year || '2026', 10) || currentYearNum);

  let selectedYearFattureId = '';
  let selectedYearF24Id = '';
  let selectedYearFileGenericiId = '';

  for (let y = startYearNum; y <= endYearNum; y++) {
    const yearFolder = await findOrCreateFolder(accessToken, `Anno ${y}`, childFolder.id);

    const fattureFolder = await findOrCreateFolder(accessToken, 'Fatture Emesse', yearFolder.id);
    const f24Folder = await findOrCreateFolder(accessToken, 'F24', yearFolder.id);
    const fileGenericiFolder = await findOrCreateFolder(accessToken, 'File Generici', yearFolder.id);

    if (String(y) === year || y === endYearNum || !selectedYearFattureId) {
      selectedYearFattureId = fattureFolder.id;
      selectedYearF24Id = f24Folder.id;
      selectedYearFileGenericiId = fileGenericiFolder.id;
    }
  }

  try {
    await createDriveShortcut(accessToken, finalFolderTitle, childFolder.id, parent);
  } catch (shortcutErr) {
    console.warn("Could not create Drive shortcut in central shared folder:", shortcutErr);
  }

  return {
    id: childFolder.id,
    url: childFolder.url || childFolder.webViewLink || `https://drive.google.com/drive/folders/${childFolder.id}`,
    fattureEmesseFolderId: selectedYearFattureId,
    f24FolderId: selectedYearF24Id,
    fileGenericiFolderId: selectedYearFileGenericiId
  };
}

/**
 * Uploads a JSON backup of Firebase data to a specific folder on Google Drive.
 */
export async function uploadFirebaseBackupToDrive(
  accessToken: string,
  jsonData: string,
  userId: string,
  targetFolderId?: string
): Promise<{ id: string; url: string }> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  let finalParentId = targetFolderId;
  
  if (targetFolderId) {
     const riepiloghiFolder = await findOrCreateFolder(accessToken, 'Riepiloghi', targetFolderId);
     finalParentId = riepiloghiFolder.id;
  } else {
     finalParentId = FIREBASE_BACKUP_FOLDER_ID;
  }

  const fileName = `firebase-backup-${userId}-${new Date().toISOString().split('T')[0]}.json`;

  const metadataUrl = 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true';
  let metadataRes = await fetch(metadataUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: fileName,
      mimeType: 'application/json',
      parents: [finalParentId],
    }),
  });

  if (metadataRes.status === 403 || metadataRes.status === 404) {
    console.warn(`[Drive Permission Fallback] No write access to ${finalParentId}. Uploading backup under 'root'.`);
    metadataRes = await fetch(metadataUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: fileName,
        mimeType: 'application/json',
        parents: ['root'],
      }),
    });
  }

  if (!metadataRes.ok) {
    const errText = await metadataRes.text();
    throw new Error(`Errore creazione metadata backup JSON (${metadataRes.status}): ${errText}`);
  }

  const metadata = await metadataRes.json();
  const fileId = metadata.id;

  const mediaUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`;
  const blob = new Blob([jsonData], { type: 'application/json' });
  
  const mediaRes = await fetch(mediaUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: blob,
  });

  if (!mediaRes.ok) {
    const errText = await mediaRes.text();
    throw new Error(`Errore caricamento backup JSON su Drive (${mediaRes.status}): ${errText}`);
  }

  return {
    id: fileId,
    url: metadata.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
  };
}

/**
 * Deletes a file from Google Drive using its file ID.
 */
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed: true }),
  });

  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    throw new Error(`Errore durante lo spostamento del file nel cestino di Drive (${res.status}): ${errText}`);
  }
}

/**
 * List the user's folders on Google Drive.
 */
export async function listDriveFolders(accessToken: string): Promise<DriveFile[]> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }
  const q = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Impossibile recuperare cartelle Drive (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.files || [];
}

/**
 * Extracts a Google Drive folder ID from a URL or raw ID string.
 */
export function extractGoogleDriveFolderId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }
  return trimmed;
}

/**
 * Uploads an XML invoice file to the "Fatture Emesse" folder inside the parent folder on Google Drive.
 */
export async function uploadInvoiceXml(
  accessToken: string,
  parentPositionFolderId: string,
  file: File,
  customFattureFolderId?: string,
  year?: string
): Promise<{ name: string; id: string; url: string; dateAdded: string }> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const targetParent = parentPositionFolderId && parentPositionFolderId.trim() !== '' ? parentPositionFolderId.trim() : FORFETTARI_ROOT_FOLDER_ID;

  let invoicesFolderId = '';
  if (customFattureFolderId && customFattureFolderId.trim() !== '') {
    invoicesFolderId = customFattureFolderId;
  } else if (year) {
    const resolved = await resolveYearFolderAndSubfolder(accessToken, targetParent, year, 'Fatture Emesse', true);
    invoicesFolderId = resolved.subfolderId;
  } else {
    invoicesFolderId = (await findOrCreateFolder(accessToken, 'Fatture Emesse', targetParent)).id;
  }

  const metadataUrl = 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true';
  let metadataRes = await fetch(metadataUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      parents: [invoicesFolderId],
    }),
  });

  if (metadataRes.status === 403 || metadataRes.status === 404) {
    console.warn(`[Drive Permission Fallback] No write access to folder ${invoicesFolderId}. Uploading to 'root'.`);
    metadataRes = await fetch(metadataUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        parents: ['root'],
      }),
    });
  }

  if (!metadataRes.ok) {
    const errText = await metadataRes.text();
    throw new Error(`Impossibile creare il file XML su Drive (${metadataRes.status}): ${errText}`);
  }

  const metadata = await metadataRes.json();
  const fileId = metadata.id;

  const mediaUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`;
  const mediaRes = await fetch(mediaUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!mediaRes.ok) {
    const errText = await mediaRes.text();
    throw new Error(`Caricamento file XML fallito (${mediaRes.status}): ${errText}`);
  }

  const getUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink&supportsAllDrives=true`;
  const getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  let webViewLink = metadata.webViewLink;
  if (getRes.ok) {
    const getData = await getRes.json();
    webViewLink = getData.webViewLink;
  }

  return {
    name: metadata.name || file.name,
    id: fileId,
    url: webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    dateAdded: new Date().toISOString().split('T')[0],
  };
}

export async function listFilesInFolder(accessToken: string, folderId: string): Promise<DriveFile[]> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const q = `'${folderId}' in parents and trashed = false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.append('q', q);
  url.searchParams.append('fields', 'files(id, name, webViewLink, mimeType, webContentLink)');
  url.searchParams.append('supportsAllDrives', 'true');
  url.searchParams.append('includeItemsFromAllDrives', 'true');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Errore reperimento file (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    url: f.webViewLink || f.webContentLink,
    dateAdded: new Date().toISOString().split('T')[0],
    mimeType: f.mimeType
  }));
}

export async function downloadFileContent(accessToken: string, fileId: string): Promise<string> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Errore nel download del file ${fileId} (${res.status}): ${await res.text()}`);
  }

  return await res.text();
}

export async function renameDriveFile(accessToken: string, fileId: string, newName: string): Promise<void> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  });

  if (!res.ok) {
    throw new Error(`Errore durante la rinominazione del file (${res.status}): ${await res.text()}`);
  }
}

/**
 * Creates a shortcut on Google Drive inside a target parent folder pointing to a source file or folder ID.
 */
export async function createDriveShortcut(
  accessToken: string,
  shortcutName: string,
  targetId: string,
  parentFolderId: string = FORFETTARI_ROOT_FOLDER_ID
): Promise<any> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const url = 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true';
  const body = {
    name: shortcutName,
    mimeType: 'application/vnd.google-apps.shortcut',
    parents: [parentFolderId],
    shortcutDetails: {
      targetId: targetId
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Impossibile creare la scorciatoia su Drive (${response.status}): ${errText}`);
  }

  return await response.json();
}

/**
 * Verifies if a given file/folder exists and is not trashed on Google Drive.
 */
export async function checkFileExists(accessToken: string, fileId: string): Promise<boolean> {
  if (!accessToken || accessToken.includes('mock-') || !fileId) return false;
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,trashed&supportsAllDrives=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    return data && !data.trashed;
  } catch (err) {
    return false;
  }
}

/**
 * Recreates or heals the entire folder structure for an accounting position.
 */
export async function verifyAndRecreateFolderStructure(
  accessToken: string,
  positionName: string,
  clientFullName: string,
  currentDriveFolderId: string | undefined,
  year: string,
  customParentId?: string,
  startYear?: string
): Promise<CreatedFolderResult> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const defaultRootId = FORFETTARI_ROOT_FOLDER_ID;
  let mainFolderId = currentDriveFolderId && currentDriveFolderId.trim() !== '' ? currentDriveFolderId : defaultRootId;
  let mainFolderUrl = `https://drive.google.com/drive/folders/${mainFolderId}`;

  // Verify main folder exists on Drive
  let mainExists = false;
  try {
    const checkRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${mainFolderId}?fields=id,name,trashed,webViewLink&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (checkRes.ok) {
      const fileData = await checkRes.json();
      if (!fileData.trashed) {
        mainFolderId = fileData.id;
        if (fileData.webViewLink) mainFolderUrl = fileData.webViewLink;
        mainExists = true;
      }
    }
  } catch (err) {
    console.warn("Could not verify existing main folder:", err);
  }

  if (!mainExists) {
    const cleanedFullName = clientFullName.trim();
    const finalFolderTitle = `Forfettario ${cleanedFullName || positionName.trim() || 'Senza Nome'}`;
    const newMain = await findOrCreateFolder(accessToken, finalFolderTitle, defaultRootId);
    mainFolderId = newMain.id;
    mainFolderUrl = newMain.url || newMain.webViewLink || `https://drive.google.com/drive/folders/${mainFolderId}`;
  }

  const currentYearNum = new Date().getFullYear();
  const startYearNum = Math.min(
    parseInt(startYear || year || '2025', 10) || 2025,
    currentYearNum
  );
  const endYearNum = Math.max(currentYearNum, parseInt(year || '2026', 10) || currentYearNum);

  let selectedYearFattureId = '';
  let selectedYearF24Id = '';
  let selectedYearFileGenericiId = '';

  for (let y = startYearNum; y <= endYearNum; y++) {
    const yrStr = String(y);
    const resFatture = await resolveYearFolderAndSubfolder(accessToken, mainFolderId, yrStr, 'Fatture Emesse', true);
    const resF24 = await resolveYearFolderAndSubfolder(accessToken, mainFolderId, yrStr, 'F24', true);
    const resGenerici = await resolveYearFolderAndSubfolder(accessToken, mainFolderId, yrStr, 'File Generici', true);

    if (yrStr === year || y === endYearNum || !selectedYearFattureId) {
      selectedYearFattureId = resFatture.subfolderId;
      selectedYearF24Id = resF24.subfolderId;
      selectedYearFileGenericiId = resGenerici.subfolderId;
    }
  }

  return {
    id: mainFolderId,
    url: mainFolderUrl,
    fattureEmesseFolderId: selectedYearFattureId,
    f24FolderId: selectedYearF24Id,
    fileGenericiFolderId: selectedYearFileGenericiId
  };
}

export interface DriveAccountingSearchResult {
  id: string; // folder ID
  name: string; // folder name on Drive
  cleanedName: string; // extracted client name, e.g. "Valeria Maros"
  url: string;
  years: string[];
  invoiceCount: number;
  f24Count: number;
  fattureEmesseFolderId?: string;
  f24FolderId?: string;
  fileGenericiFolderId?: string;
  sampleIssuer?: {
    name?: string;
    vat?: string;
    cf?: string;
  };
}

/**
 * Searches Google Drive for accounting positions / client folders.
 */
export async function searchDriveForAccountingPositions(
  accessToken: string,
  searchQuery: string = ''
): Promise<DriveAccountingSearchResult[]> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const queryLower = searchQuery.trim().toLowerCase();
  const candidatesMap = new Map<string, { id: string; name: string; webViewLink?: string; mimeType?: string }>();

  // 1. Search inside the central root "forfettari" folder
  const centralRootQ = `'${FORFETTARI_ROOT_FOLDER_ID}' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.shortcut')`;
  const centralUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(centralRootQ)}&fields=files(id,name,webViewLink,mimeType,shortcutDetails)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  try {
    const centralRes = await fetch(centralUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (centralRes.ok) {
      const centralData = await centralRes.json();
      for (const file of centralData.files || []) {
        let realId = file.id;
        if (file.mimeType === 'application/vnd.google-apps.shortcut' && file.shortcutDetails?.targetId) {
          realId = file.shortcutDetails.targetId;
        }
        candidatesMap.set(realId, {
          id: realId,
          name: file.name,
          webViewLink: file.webViewLink,
          mimeType: file.mimeType
        });
      }
    }
  } catch (centralErr) {
    console.warn("Could not list central forfettari folder:", centralErr);
  }

  // 2. Perform global search
  const searchTerms = queryLower ? queryLower.split(/\s+/).filter(Boolean) : [];
  const queryConditions: string[] = [
    "trashed = false",
    "(mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.shortcut')"
  ];

  if (searchTerms.length > 0) {
    const termOrs: string[] = [];
    for (const term of searchTerms) {
      const safeTerm = term.replace(/'/g, "\\'");
      termOrs.push(`name contains '${safeTerm}'`);
      const cap = term.charAt(0).toUpperCase() + term.slice(1);
      termOrs.push(`name contains '${cap}'`);
    }
    queryConditions.push(`(${termOrs.join(' or ')})`);
  } else {
    queryConditions.push(`(name contains 'Forfettario' or name contains 'forfettario' or name contains 'Contabilità')`);
  }

  const globalQ = queryConditions.join(' and ');
  const globalUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(globalQ)}&fields=files(id,name,webViewLink,mimeType,shortcutDetails)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const globalRes = await fetch(globalUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!globalRes.ok) {
    const errText = await globalRes.text();
    throw new Error(`Google Drive Search Failed (${globalRes.status}): ${errText}`);
  }

  const globalData = await globalRes.json();
  for (const file of globalData.files || []) {
    let realId = file.id;
    if (file.mimeType === 'application/vnd.google-apps.shortcut' && file.shortcutDetails?.targetId) {
      realId = file.shortcutDetails.targetId;
    }
    if (!candidatesMap.has(realId)) {
      candidatesMap.set(realId, {
        id: realId,
        name: file.name,
        webViewLink: file.webViewLink,
        mimeType: file.mimeType
      });
    }
  }

  let candidateList = Array.from(candidatesMap.values());
  if (queryLower) {
    candidateList = candidateList.filter(c => {
      const n = c.name.toLowerCase();
      return searchTerms.some(term => n.includes(term));
    });
  }

  const results: DriveAccountingSearchResult[] = [];

  for (const cand of candidateList) {
    const cleanedName = cand.name
      .replace(/^Forfettario\s+/i, '')
      .replace(/^Contabilità\s+/i, '')
      .replace(/^Cartella\s+/i, '')
      .trim();

    const itemResult: DriveAccountingSearchResult = {
      id: cand.id,
      name: cand.name,
      cleanedName: cleanedName || cand.name,
      url: cand.webViewLink || `https://drive.google.com/drive/folders/${cand.id}`,
      years: [],
      invoiceCount: 0,
      f24Count: 0
    };

    try {
      const childQ = `'${cand.id}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
      const childUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(childQ)}&fields=files(id,name)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const childRes = await fetch(childUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (childRes.ok) {
        const childData = await childRes.json();
        const children: { id: string; name: string }[] = childData.files || [];

        const yearFolders = children.filter(c => {
          const m = c.name.match(/(?:Anno\s*)?(202[0-9])/i);
          return !!m;
        });

        for (const yf of yearFolders) {
          const match = yf.name.match(/(?:Anno\s*)?(202[0-9])/i);
          if (match && match[1] && !itemResult.years.includes(match[1])) {
            itemResult.years.push(match[1]);
          }
        }

        const directFatture = children.find(c => c.name.trim().toLowerCase() === 'fatture emesse');
        const directF24 = children.find(c => c.name.trim().toLowerCase() === 'f24');
        const directGenerici = children.find(c => c.name.trim().toLowerCase() === 'file generici');

        if (directFatture) itemResult.fattureEmesseFolderId = directFatture.id;
        if (directF24) itemResult.f24FolderId = directF24.id;
        if (directGenerici) itemResult.fileGenericiFolderId = directGenerici.id;

        for (const yf of yearFolders) {
          try {
            const ySubQ = `'${yf.id}' in parents and trashed = false`;
            const ySubUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(ySubQ)}&fields=files(id,name,mimeType)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`;
            const ySubRes = await fetch(ySubUrl, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (ySubRes.ok) {
              const ySubData = await ySubRes.json();
              const ySubFiles: { id: string; name: string; mimeType: string }[] = ySubData.files || [];

              for (const sub of ySubFiles) {
                if (sub.mimeType === 'application/vnd.google-apps.folder') {
                  const sName = sub.name.trim().toLowerCase();
                  if (sName === 'fatture emesse' || sName.includes('fattur')) {
                    itemResult.fattureEmesseFolderId = sub.id;
                    const invList = await listFilesInFolder(accessToken, sub.id).catch(() => []);
                    itemResult.invoiceCount += invList.filter(f => f.name.endsWith('.xml') || (f.mimeType && f.mimeType.includes('xml'))).length;

                    if (!itemResult.sampleIssuer && invList.length > 0) {
                      const firstXml = invList.find(f => f.name.endsWith('.xml') || (f.mimeType && f.mimeType.includes('xml')));
                      if (firstXml) {
                        try {
                          const xmlContent = await downloadFileContent(accessToken, firstXml.id);
                          const parsed = parseInvoiceXml(xmlContent);
                          if (parsed.issuerName || parsed.issuerVat || parsed.issuerCf) {
                            itemResult.sampleIssuer = {
                              name: parsed.issuerName,
                              vat: parsed.issuerVat,
                              cf: parsed.issuerCf
                            };
                          }
                        } catch (parseErr) {
                          // ignore
                        }
                      }
                    }
                  } else if (sName === 'f24' || sName.includes('f24')) {
                    itemResult.f24FolderId = sub.id;
                    const f24List = await listFilesInFolder(accessToken, sub.id).catch(() => []);
                    itemResult.f24Count += f24List.filter(f => f.name.toLowerCase().endsWith('.pdf')).length;
                  } else if (sName === 'file generici' || sName.includes('generic')) {
                    itemResult.fileGenericiFolderId = sub.id;
                  }
                }
              }
            }
          } catch (yErr) {
            // ignore
          }
        }
      }
    } catch (childErr) {
      console.warn(`Could not inspect children for ${cand.name}:`, childErr);
    }

    if (itemResult.years.length === 0) {
      itemResult.years = ['2025', '2026'];
    }
    itemResult.years.sort();

    results.push(itemResult);
  }

  return results;
}

/**
 * Imports an accounting position discovered on Google Drive into the application.
 */
export async function importAccountingPositionFromDrive(
  accessToken: string,
  searchResult: DriveAccountingSearchResult,
  preferredYear: string = '2026'
): Promise<AccountingPosition> {
  if (!accessToken || accessToken.includes('mock-')) {
    throw new Error('AUTH_REQUIRED: Invalid or missing Google Access Token.');
  }

  const fullName = searchResult.sampleIssuer?.name || searchResult.cleanedName || 'Valeria Maros';
  const vatNumber = searchResult.sampleIssuer?.vat || '03847291048';
  const fiscalCode = searchResult.sampleIssuer?.cf || 'MRSVLR88H50H501Z';
  const startYear = (searchResult.years && searchResult.years.length > 0) ? searchResult.years.sort()[0] : '2025';

  const positionId = `pos-drive-${searchResult.id}`;

  const importedInvoices: Invoice[] = [];
  const importedF24Files: { name: string; id: string; url: string; dateAdded: string }[] = [];
  const importedF24Entries: F24Entry[] = [];

  for (const yr of searchResult.years) {
    try {
      const resolved = await resolveYearFolderAndSubfolder(accessToken, searchResult.id, yr, 'Fatture Emesse', false);
      if (resolved.subfolderId) {
        const files = await listFilesInFolder(accessToken, resolved.subfolderId).catch(() => []);
        for (const f of files) {
          if (f.name.endsWith('.xml') || (f.mimeType && f.mimeType.includes('xml'))) {
            try {
              const content = await downloadFileContent(accessToken, f.id);
              const parsed = parseInvoiceXml(content);
              importedInvoices.push({
                id: `inv-dr-${f.id}`,
                date: parsed.date || `${yr}-01-01`,
                number: parsed.number,
                clientName: parsed.clientName,
                clientVat: parsed.clientVat || '',
                amount: parsed.amount,
                isPaid: true,
                hasStampDuty: parsed.hasStampDuty,
                notes: parsed.notes,
                driveFileId: f.id,
                driveFileUrl: f.url
              });
            } catch (e) {
              console.warn(`Error reading XML ${f.name}:`, e);
            }
          }
        }
      }

      const resolvedF24 = await resolveYearFolderAndSubfolder(accessToken, searchResult.id, yr, 'F24', false);
      if (resolvedF24.subfolderId) {
        const f24Files = await listFilesInFolder(accessToken, resolvedF24.subfolderId).catch(() => []);
        for (const f of f24Files) {
          if (f.name.toLowerCase().endsWith('.pdf')) {
            importedF24Files.push({
              id: f.id,
              name: f.name,
              url: f.url || `https://drive.google.com/file/d/${f.id}/view`,
              dateAdded: f.dateAdded || `${yr}-01-01`
            });
          }
        }
      }
    } catch (scanYearErr) {
      console.warn(`Could not scan year ${yr}:`, scanYearErr);
    }
  }

  const profile: BusinessProfile = {
    fullName,
    vatNumber,
    fiscalCode,
    atecoCode: '70.22.09',
    pensionFund: 'INPS_GESTIONE_SEPARATA',
    startYear: startYear || '2025',
    isStartup: true,
    inpsReduction35: false
  };

  return {
    id: positionId,
    name: `Posizione (${fullName})`,
    profile,
    invoices: importedInvoices,
    f24Files: importedF24Files,
    f24Entries: importedF24Entries,
    driveFolderId: searchResult.id,
    driveFolderUrl: searchResult.url,
    fattureEmesseFolderId: searchResult.fattureEmesseFolderId,
    f24FolderId: searchResult.f24FolderId,
    fileGenericiFolderId: searchResult.fileGenericiFolderId
  };
}