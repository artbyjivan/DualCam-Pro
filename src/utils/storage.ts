import { CapturedMediaItem, StorageEstimateInfo } from '../types/camera';

const DB_NAME = 'dualcam_pro_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'captures';

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCapturedMedia(item: CapturedMediaItem): Promise<void> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getAllCapturedMedia(): Promise<CapturedMediaItem[]> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      db.close();
      const items = (req.result as CapturedMediaItem[]) || [];
      items.sort((a, b) => b.createdAt - a.createdAt);
      resolve(items);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function deleteCapturedMedia(id: string): Promise<void> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getStorageEstimate(): Promise<StorageEstimateInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { quotaBytes: 0, usageBytes: 0, remainingBytes: 0, supported: false };
  }
  try {
    const est = await navigator.storage.estimate();
    const quotaBytes = est.quota ?? 0;
    const usageBytes = est.usage ?? 0;
    return {
      quotaBytes,
      usageBytes,
      remainingBytes: Math.max(0, quotaBytes - usageBytes),
      supported: quotaBytes > 0,
    };
  } catch {
    return { quotaBytes: 0, usageBytes: 0, remainingBytes: 0, supported: false };
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[idx]}`;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
