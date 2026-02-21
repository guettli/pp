// src/speech/model-cache.ts
// Simple IndexedDB cache for ONNX model files

const DB_NAME = "onnx-model-cache";
const STORE_NAME = "models";
const PARTIAL_STORE_NAME = "partial-downloads";
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(PARTIAL_STORE_NAME)) {
        db.createObjectStore(PARTIAL_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getModelFromCache(key: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveModelToCache(key: string, arrayBuffer: ArrayBuffer): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(arrayBuffer, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export interface PartialDownload {
  data: ArrayBuffer;
  total: number; // expected total bytes; 0 if unknown
}

export async function getPartialDownload(key: string): Promise<PartialDownload | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PARTIAL_STORE_NAME, "readonly");
    const store = tx.objectStore(PARTIAL_STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function savePartialDownload(key: string, partial: PartialDownload): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PARTIAL_STORE_NAME, "readwrite");
    const store = tx.objectStore(PARTIAL_STORE_NAME);
    const req = store.put(partial, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearPartialDownload(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PARTIAL_STORE_NAME, "readwrite");
    const store = tx.objectStore(PARTIAL_STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
