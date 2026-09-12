/**
 * Wspólna matematyka prefetchu kafli rastrowych (Web Mercator, schemat XYZ) dla dowolnego
 * źródła kafli (Google, HERE, WMS) — wyznacza zakres kafli pokrywających okrąg zasięgu
 * projektu przy zoomie dobranym proporcjonalnie do promienia.
 */

export interface TileRange {
  zoom: number;
  startTileX: number;
  endTileX: number;
  startTileY: number;
  endTileY: number;
  tileCount: number;
}

/** Maksymalna liczba kafli w jednym prefetchu — zabezpieczenie przed lawiną requestów przy dużym promieniu/zoomie. */
export const MAX_PREFETCH_TILES = 200;

/** Dobiera zoom proporcjonalnie do promienia — małe obszary wymagają wyższego zoomu. */
export function zoomForRadius(radiusMeters: number): number {
  return radiusMeters <= 100 ? 18 : radiusMeters <= 200 ? 17 : radiusMeters <= 500 ? 16 : 15;
}

/** Wyznacza zakres kafli XYZ pokrywających okrąg (lat, lon, promień w metrach). Zwraca `null` gdy przekroczono `MAX_PREFETCH_TILES`. */
export function computeTileRange(lat: number, lon: number, radiusMeters: number): TileRange | null {
  const zoom = zoomForRadius(radiusMeters);

  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));

  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLon = lon - lonDelta;
  const maxLon = lon + lonDelta;

  const maxTile = Math.pow(2, zoom);
  const latToTileY = (latDeg: number) => {
    const latRad = (latDeg * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * maxTile);
  };
  const lonToTileX = (lonDeg: number) => Math.floor(((lonDeg + 180) / 360) * maxTile);

  const startTileX = lonToTileX(minLon);
  const endTileX = lonToTileX(maxLon);
  const startTileY = latToTileY(maxLat); // Y jest odwrócony (0 = północ)
  const endTileY = latToTileY(minLat);

  const tileCount = (endTileX - startTileX + 1) * (endTileY - startTileY + 1);
  if (tileCount > MAX_PREFETCH_TILES) return null;

  return { zoom, startTileX, endTileX, startTileY, endTileY, tileCount };
}

/** Klucz kafla w formacie używanym przez wszystkie menedżery cache (`z/x/y`). */
export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

/** Wylicza zbiór kluczy kafli objętych zakresem — używane do "przypinania" kafli w cache przed eviction. */
export function tileKeysInRange(range: TileRange): Set<string> {
  const keys = new Set<string>();
  for (let tx = range.startTileX; tx <= range.endTileX; tx++) {
    for (let ty = range.startTileY; ty <= range.endTileY; ty++) {
      keys.add(tileKey(range.zoom, tx, ty));
    }
  }
  return keys;
}

/**
 * Cache LRU z "przypinaniem" kluczy w zasięgu projektu — wspólna implementacja dla wszystkich
 * menedżerów kafli (Google, HERE, WMS), które wcześniej duplikowały tę samą logikę eviction.
 * Kafle spoza `protectedKeys` są usuwane w pierwszej kolejności (od najstarszego), więc zwykłe
 * przewijanie/zoom poza zasięgiem projektu nie wypycha z cache danych, które są w zasięgu.
 */
export class ProtectedLruCache<V> {
  private readonly cache = new Map<string, V>();
  private protectedKeys: Set<string> = new Set();

  constructor(private readonly baseMaxSize: number) {}

  get(key: string): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Odśwież pozycję w kolejności LRU (delete + set)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  set(key: string, value: V) {
    const effectiveMax = this.baseMaxSize + this.protectedKeys.size;
    if (this.cache.size >= effectiveMax && !this.cache.has(key)) {
      let victim: string | undefined;
      for (const k of this.cache.keys()) {
        if (!this.protectedKeys.has(k)) { victim = k; break; }
      }
      this.cache.delete(victim ?? this.cache.keys().next().value!);
    }
    this.cache.set(key, value);
  }

  /** Ustawia zbiór kluczy chronionych przed eviction — wywołaj po każdym prefetchu w nowym zasięgu. */
  setProtectedKeys(keys: Set<string>) {
    this.protectedKeys = keys;
  }

  clear() {
    this.cache.clear();
    this.protectedKeys.clear();
  }
}
