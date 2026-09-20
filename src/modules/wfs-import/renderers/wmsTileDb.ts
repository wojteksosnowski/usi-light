/**
 * Trwały cache kafli WMS/GUGiK w IndexedDB — pozwala zachować pobrane kafle ortofotomapy/podkładów
 * geodezyjnych pomiędzy sesjami przeglądarki (bez tego, każde otwarcie aplikacji zaczyna z pustym
 * buforem w pamięci i wymaga ponownego pobrania wszystkich kafli z sieci).
 *
 * Zakres: wyłącznie serwisy WMS obsługiwane przez WmsTileManager (GUGiK i pochodne). Inni dostawcy
 * kafli (HERE, Google) pozostają tylko w pamięci RAM (inne warunki licencyjne cache'owania).
 */

const DB_NAME = 'usi-light-wms-cache';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni
const MAX_ENTRIES = 2000;

interface CachedTileRecord {
  key: string;
  blob: Blob;
  timestamp: number;
  layerId: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
let warnedUnavailable = false;

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function openTileDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('[wmsTileDb] IndexedDB niedostępny w tym środowisku — cache kafli WMS pozostanie tylko w pamięci.');
    }
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[wmsTileDb] Nie udało się otworzyć IndexedDB:', req.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('[wmsTileDb] Błąd inicjalizacji IndexedDB:', err);
      resolve(null);
    }
  });

  return dbPromise;
}

export async function getCachedTile(key: string): Promise<{ blob: Blob; timestamp: number } | null> {
  const db = await openTileDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result as CachedTileRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }
        if (Date.now() - record.timestamp > TTL_MS) {
          resolve(null);
          return;
        }
        resolve({ blob: record.blob, timestamp: record.timestamp });
        // Odświeżenie timestampu trafienia (LRU) — best-effort, poza główną ścieżką odczytu
        void touchCachedTile(key);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function touchCachedTile(key: string): Promise<void> {
  const db = await openTileDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => {
      const record = req.result as CachedTileRecord | undefined;
      if (record) {
        record.timestamp = Date.now();
        store.put(record);
      }
    };
  } catch {
    // Best-effort — brak odświeżenia timestampu nie jest krytyczne.
  }
}

export async function putCachedTile(key: string, blob: Blob, layerId: string): Promise<void> {
  const db = await openTileDb();
  if (!db) return;

  const record: CachedTileRecord = { key, blob, timestamp: Date.now(), layerId };

  const tryPut = () =>
    new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });

  await tryPut();
}

/** Usuwa wygasłe wpisy (TTL) i, jeśli liczba wpisów przekracza limit, dodatkowo najstarsze
 * (wg timestamp ostatniego użycia). Uruchamiane raz na sesję, w tle, bez blokowania renderu. */
export async function cleanupExpiredTiles(): Promise<void> {
  const db = await openTileDb();
  if (!db) return;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    const now = Date.now();

    const allEntries: { key: string; timestamp: number }[] = [];
    await new Promise<void>((resolve) => {
      const cursorReq = index.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve();
          return;
        }
        const record = cursor.value as CachedTileRecord;
        if (now - record.timestamp > TTL_MS) {
          cursor.delete();
        } else {
          allEntries.push({ key: record.key, timestamp: record.timestamp });
        }
        cursor.continue();
      };
      cursorReq.onerror = () => resolve();
    });

    if (allEntries.length > MAX_ENTRIES) {
      allEntries.sort((a, b) => a.timestamp - b.timestamp);
      const toEvict = allEntries.slice(0, allEntries.length - MAX_ENTRIES);
      const tx2 = db.transaction(STORE_NAME, 'readwrite');
      const store2 = tx2.objectStore(STORE_NAME);
      toEvict.forEach((e) => store2.delete(e.key));
    }
  } catch (err) {
    console.warn('[wmsTileDb] Czyszczenie cache nie powiodło się:', err);
  }
}
