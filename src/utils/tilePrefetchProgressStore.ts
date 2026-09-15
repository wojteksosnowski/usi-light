import { useSyncExternalStore } from 'react';

export type TilePrefetchProgress = { pending: number; total: number };

/**
 * Lekki, nietrwały (nie-Zustand, nie persystowany) store postępu buforowania kafli rastrowych
 * (WMS, Google, HERE) per usługa — zasilany bezpośrednio z callbacków tile managerów (patrz
 * registerGeoLayers.ts i CadCanvas.tsx). Celowo osobny od store'ów Zustand: to dane czysto
 * UI-owe (licznik kafli), nieprzeznaczone do localStorage.
 */
const progress = new Map<string, TilePrefetchProgress>();
const listeners = new Map<string, Set<() => void>>();

let rafScheduled = false;
let dirtyKeys = new Set<string>();

function flush() {
  rafScheduled = false;
  for (const key of dirtyKeys) {
    listeners.get(key)?.forEach((l) => l());
  }
  dirtyKeys = new Set();
}

export function setTilePrefetchProgress(serviceKey: string, value: TilePrefetchProgress) {
  const prev = progress.get(serviceKey);
  if (prev && prev.pending === value.pending && prev.total === value.total) return;
  progress.set(serviceKey, value);
  dirtyKeys.add(serviceKey);
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(flush);
  }
}

function subscribe(serviceKey: string, listener: () => void): () => void {
  let set = listeners.get(serviceKey);
  if (!set) {
    set = new Set();
    listeners.set(serviceKey, set);
  }
  set.add(listener);
  return () => set!.delete(listener);
}

function getSnapshot(serviceKey: string): TilePrefetchProgress | null {
  return progress.get(serviceKey) ?? null;
}

/** Zwraca `{ pending, total }` dla danej usługi kafli lub `null` gdy prefetch jeszcze nie startował. */
export function useTilePrefetchProgress(serviceKey: string): TilePrefetchProgress | null {
  return useSyncExternalStore(
    (listener) => subscribe(serviceKey, listener),
    () => getSnapshot(serviceKey)
  );
}
