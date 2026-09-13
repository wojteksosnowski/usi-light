// src/modules/action-recorder/actionRecorderStorage.ts
// Magazyn IndexedDB dla nagrań (wideo WebM + sesje JSON)

import { ActionSession, CatalogItem } from './types';

const DB_NAME = 'usi_action_recorder_db';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_VIDEOS = 'videos';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB nie jest dostępne w tym środowisku'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecording(
  session: ActionSession,
  videoBlob?: Blob
): Promise<string> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS, STORE_VIDEOS], 'readwrite');
    const sessionStore = tx.objectStore(STORE_SESSIONS);
    const videoStore = tx.objectStore(STORE_VIDEOS);

    const catalogEntry = {
      ...session,
      videoBlobSize: videoBlob ? videoBlob.size : undefined,
    };

    sessionStore.put(catalogEntry);

    if (videoBlob) {
      videoStore.put({ id: session.id, blob: videoBlob });
    }

    tx.oncomplete = () => resolve(session.id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllCatalogItems(): Promise<CatalogItem[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS, STORE_VIDEOS], 'readonly');
    const sessionStore = tx.objectStore(STORE_SESSIONS);
    const videoStore = tx.objectStore(STORE_VIDEOS);

    const sessionsReq = sessionStore.getAll();
    const videoKeysReq = videoStore.getAllKeys();

    tx.oncomplete = () => {
      const sessions: ActionSession[] = sessionsReq.result || [];
      const videoKeySet = new Set(videoKeysReq.result || []);

      const items: CatalogItem[] = sessions.map((s) => ({
        id: s.id,
        title: s.title || `Nagranie ${new Date(s.createdAt).toLocaleTimeString()}`,
        createdAt: s.createdAt,
        durationMs: s.durationMs,
        aspectRatio: s.aspectRatio,
        eventCount: s.events?.length ?? 0,
        hasVideo: videoKeySet.has(s.id),
        hasSessionData: true,
        videoBlobSize: (s as any).videoBlobSize,
      }));

      // Sortuj od najnowszego
      items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      resolve(items);
    };

    tx.onerror = () => reject(tx.error);
  });
}

export async function getSession(id: string): Promise<ActionSession | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const req = store.get(id);

    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getVideoBlob(id: string): Promise<Blob | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VIDEOS, 'readonly');
    const store = tx.objectStore(STORE_VIDEOS);
    const req = store.get(id);

    req.onsuccess = () => {
      const res = req.result;
      resolve(res ? res.blob : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS, STORE_VIDEOS], 'readwrite');
    tx.objectStore(STORE_SESSIONS).delete(id);
    tx.objectStore(STORE_VIDEOS).delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function renameRecording(id: string, newTitle: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      if (getReq.result) {
        const updated = { ...getReq.result, title: newTitle };
        store.put(updated);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function downloadJson(data: any, fileName: string): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  downloadBlob(blob, fileName);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
