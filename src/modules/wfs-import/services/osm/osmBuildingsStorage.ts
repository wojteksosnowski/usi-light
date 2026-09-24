/**
 * osmBuildingsStorage.ts
 *
 * Magazyn tymczasowy dla danych OSM (Overpass API) w IndexedDB (z fallbackiem w pamięci RAM).
 * Zapobiega utracie pobranych danych przy przerwaniu połączenia, umożliwia wznawianie
 * od miejsca przerwania oraz eliminuje powtarzanie kosztownych zapytań o kwadranty
 * i części 3D (building:part po ID).
 */

import { BuildingLoop } from '../../../../types/geometry';
import { OverpassResponse } from './osmBuildingsClient';
import { WfsBbox } from '../city/wfsWarsawClient';

const DB_NAME = 'usi-light-osm-cache';
const DB_VERSION = 1;

const STORE_QUADRANTS = 'osm_raw_quadrants';
const STORE_PARTS = 'osm_building_parts';
const STORE_ASSEMBLED = 'osm_assembled_buildings';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dni

interface CachedRecord<T> {
  key: string;
  data: T;
  timestamp: number;
}

// Fallback in-memory (np. gdy IndexedDB jest wyłączone lub w środowisku Node/testowym)
const memoryQuadrants = new Map<string, CachedRecord<OverpassResponse>>();
const memoryParts = new Map<string, CachedRecord<OverpassResponse>>();
const memoryAssembled = new Map<string, CachedRecord<BuildingLoop[]>>();

let dbPromise: Promise<IDBDatabase | null> | null = null;
let warnedUnavailable = false;

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openOsmDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      // W środowisku bez IndexedDB pracujemy na buforze RAM
    }
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_QUADRANTS)) {
          db.createObjectStore(STORE_QUADRANTS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_PARTS)) {
          db.createObjectStore(STORE_PARTS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_ASSEMBLED)) {
          db.createObjectStore(STORE_ASSEMBLED, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[osmBuildingsStorage] Nie udało się otworzyć IndexedDB:', req.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('[osmBuildingsStorage] Błąd inicjalizacji IndexedDB:', err);
      resolve(null);
    }
  });

  return dbPromise;
}

export function formatQuadrantKey(bbox: WfsBbox): string {
  return bbox.map((coord) => coord.toFixed(5)).join(',');
}

export function formatPartsBatchKey(wayIds: number[], relIds: number[]): string {
  const sortedWays = [...wayIds].sort((a, b) => a - b).join(',');
  const sortedRels = [...relIds].sort((a, b) => a - b).join(',');
  return `w:[${sortedWays}]_r:[${sortedRels}]`;
}

export function formatAssembledKey(centerLat: number, centerLon: number, radiusMeters: number, crs: string): string {
  return `${centerLat.toFixed(5)}_${centerLon.toFixed(5)}_r${Math.round(radiusMeters)}_${crs}`;
}

async function getFromStore<T>(
  storeName: string,
  key: string,
  memoryMap: Map<string, CachedRecord<T>>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T | null> {
  const mem = memoryMap.get(key);
  if (mem) {
    if (Date.now() - mem.timestamp <= ttlMs) {
      return mem.data;
    }
    memoryMap.delete(key);
  }

  const db = await openOsmDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result as CachedRecord<T> | undefined;
        if (!record) {
          resolve(null);
          return;
        }
        if (Date.now() - record.timestamp > ttlMs) {
          resolve(null);
          return;
        }
        memoryMap.set(key, record);
        resolve(record.data);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveToStore<T>(
  storeName: string,
  key: string,
  data: T,
  memoryMap: Map<string, CachedRecord<T>>
): Promise<void> {
  const record: CachedRecord<T> = {
    key,
    data,
    timestamp: Date.now(),
  };
  memoryMap.set(key, record);

  const db = await openOsmDb();
  if (!db) return;

  try {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(record);
  } catch (err) {
    console.warn(`[osmBuildingsStorage] Błąd zapisu do ${storeName}:`, err);
  }
}

// --- Publiczne API Magazynu ---

export async function getQuadrantCache(quadrantBbox: WfsBbox, ttlMs?: number): Promise<OverpassResponse | null> {
  const key = formatQuadrantKey(quadrantBbox);
  return getFromStore(STORE_QUADRANTS, key, memoryQuadrants, ttlMs);
}

export async function setQuadrantCache(quadrantBbox: WfsBbox, response: OverpassResponse): Promise<void> {
  const key = formatQuadrantKey(quadrantBbox);
  return saveToStore(STORE_QUADRANTS, key, response, memoryQuadrants);
}

export async function getBuildingPartsBatchCache(
  wayIds: number[],
  relIds: number[],
  ttlMs?: number
): Promise<OverpassResponse | null> {
  const key = formatPartsBatchKey(wayIds, relIds);
  return getFromStore(STORE_PARTS, key, memoryParts, ttlMs);
}

export async function setBuildingPartsBatchCache(
  wayIds: number[],
  relIds: number[],
  response: OverpassResponse
): Promise<void> {
  const key = formatPartsBatchKey(wayIds, relIds);
  return saveToStore(STORE_PARTS, key, response, memoryParts);
}

export async function getAssembledBuildingsCache(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  crs: string,
  ttlMs?: number
): Promise<BuildingLoop[] | null> {
  const key = formatAssembledKey(centerLat, centerLon, radiusMeters, crs);
  return getFromStore(STORE_ASSEMBLED, key, memoryAssembled, ttlMs);
}

export async function setAssembledBuildingsCache(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  crs: string,
  buildings: BuildingLoop[]
): Promise<void> {
  const key = formatAssembledKey(centerLat, centerLon, radiusMeters, crs);
  return saveToStore(STORE_ASSEMBLED, key, buildings, memoryAssembled);
}

export async function clearOsmBuildingsStorage(): Promise<void> {
  memoryQuadrants.clear();
  memoryParts.clear();
  memoryAssembled.clear();

  const db = await openOsmDb();
  if (!db) return;

  try {
    const tx = db.transaction([STORE_QUADRANTS, STORE_PARTS, STORE_ASSEMBLED], 'readwrite');
    tx.objectStore(STORE_QUADRANTS).clear();
    tx.objectStore(STORE_PARTS).clear();
    tx.objectStore(STORE_ASSEMBLED).clear();
  } catch (err) {
    console.warn('[osmBuildingsStorage] Błąd czyszczenia IndexedDB:', err);
  }
}
