import { zipSync, strToU8 } from 'fflate';
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
        videoFormat: s.videoFormat || 'mp4',
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

export async function downloadSessionZip(id: string): Promise<void> {
  const session = await getSession(id);
  if (!session) return;

  const videoBlob = await getVideoBlob(id);
  const titleSafe = (session.title || `sesja_${id}`).replace(/\s+/g, '_');

  const zipEntries: Record<string, Uint8Array> = {};

  // 1. Zapis sesji JSON
  const jsonStr = JSON.stringify(session, null, 2);
  zipEntries[`${titleSafe}.json`] = strToU8(jsonStr);

  // 2. Zapis pliku wideo / animacji
  if (videoBlob) {
    const arrayBuffer = await videoBlob.arrayBuffer();
    const ext = videoBlob.type.includes('mp4')
      ? 'mp4'
      : videoBlob.type.includes('gif')
      ? 'gif'
      : 'webm';
    zipEntries[`${titleSafe}.${ext}`] = new Uint8Array(arrayBuffer);
  }

  // 3. Plik README / metadane
  const infoText = `USI Light - Klip Sesji Demo
Tytuł: ${session.title}
Data: ${new Date(session.createdAt).toLocaleString('pl-PL')}
Czas trwania: ${(session.durationMs / 1000).toFixed(1)}s
Format rzutni: ${session.aspectRatio}
Liczba zarejestrowanych operacji: ${session.events?.length ?? 0}
`;
  zipEntries['info.txt'] = strToU8(infoText);

  const zipped = zipSync(zipEntries);
  const zipBlob = new Blob([zipped as any], { type: 'application/zip' });
  downloadBlob(zipBlob, `${titleSafe}.zip`);
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
