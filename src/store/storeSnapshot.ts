/**
 * storeSnapshot.ts
 *
 * Generyczny helper do tworzenia migawek (snapshots), nakładania tymczasowych nadpisań
 * (overrides) oraz bezpiecznego, idempotentnego przywracania stanu (restore) w magazynach Zustand.
 */

export interface StoreLike<T> {
  getState: () => T;
  setState: (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
}

export interface DeclarativeStoreOverride<T = any> {
  store: StoreLike<T>;
  /** Deklaratywna mapa pól do nadpisania — automatycznie zapisuje bieżące wartości i przywraca je w restore() */
  overrides: Partial<T>;
  capture?: never;
  apply?: (store: StoreLike<T>) => void;
  restore?: never;
}

export interface CustomStoreOverride<T = any, S = any> {
  store: StoreLike<T>;
  overrides?: never;
  /** Niestandardowy handler zapisu stanu */
  capture: (state: T) => S;
  /** Opcjonalny handler nakładania zmian */
  apply?: (store: StoreLike<T>) => void;
  /** Niestandardowy handler przywracania stanu */
  restore: (store: StoreLike<T>, snapshot: S) => void;
}

export type StoreOverrideEntry<T = any, S = any> =
  | DeclarativeStoreOverride<T>
  | CustomStoreOverride<T, S>;

/**
 * Klonuje wartość do migawki — dla tablic tworzy kopię płytką [...val],
 * dla typów prostych i obiektów zachowuje referencję.
 */
function cloneValueForSnapshot<V>(val: V): V {
  if (Array.isArray(val)) {
    return [...val] as unknown as V;
  }
  return val;
}

/**
 * Aplikuje zestaw nadpisań dla jednego lub wielu magazynów Zustand.
 * Zwraca idempotentną funkcję `restore()`, która przywraca poprzedni stan w odwrotnej kolejności.
 */
export function applyStoreOverrides(entries: StoreOverrideEntry[]): () => void {
  const cleanupFns: Array<() => void> = [];

  for (const entry of entries) {
    const store = entry.store;

    if ('overrides' in entry && entry.overrides) {
      const overrides = entry.overrides;
      const currentState = store.getState();
      const snapshot: Record<string, any> = {};

      for (const key of Object.keys(overrides)) {
        snapshot[key] = cloneValueForSnapshot((currentState as Record<string, any>)[key]);
      }

      store.setState(overrides);

      if (typeof entry.apply === 'function') {
        entry.apply(store);
      }

      cleanupFns.push(() => {
        store.setState(snapshot);
      });
    } else if ('capture' in entry && typeof entry.capture === 'function') {
      const snapshot = entry.capture(store.getState());

      if (typeof entry.apply === 'function') {
        entry.apply(store);
      }

      cleanupFns.push(() => {
        if (typeof entry.restore === 'function') {
          entry.restore(store, snapshot);
        }
      });
    }
  }

  let isRestored = false;
  return () => {
    if (isRestored) return;
    isRestored = true;
    for (let i = cleanupFns.length - 1; i >= 0; i--) {
      cleanupFns[i]();
    }
  };
}
