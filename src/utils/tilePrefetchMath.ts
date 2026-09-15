/**
 * Wspólna matematyka prefetchu kafli rastrowych (Web Mercator, schemat XYZ) dla dowolnego
 * źródła kafli (Google, HERE, WMS) — wyznacza zakres kafli pokrywających okrąg zasięgu
 * projektu przy pojedynczym lub wszystkich poziomach zoom.
 */

export interface TileRange {
  zoom: number;
  startTileX: number;
  endTileX: number;
  startTileY: number;
  endTileY: number;
  tileCount: number;
}

/** Maksymalna liczba kafli w jednym prefetchu dla pojedynczego zoomu. */
export const MAX_PREFETCH_TILES = 500;

/** Dobiera zoom proporcjonalnie do promienia — małe obszary wymagają wyższego zoomu. */
export function zoomForRadius(radiusMeters: number): number {
  return radiusMeters <= 100 ? 18 : radiusMeters <= 200 ? 17 : radiusMeters <= 500 ? 16 : 15;
}

/**
 * Wyznacza zakres kafli XYZ dla zadanego poziomu zoomu pokrywających okrąg (lat, lon, promień w metrach).
 */
export function computeTileRangeForZoom(lat: number, lon: number, radiusMeters: number, zoom: number): TileRange {
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

  return { zoom, startTileX, endTileX, startTileY, endTileY, tileCount };
}

/** Wyznacza zakres kafli XYZ pokrywających okrąg (lat, lon, promień w metrach) dla optymalnego zoomu. Zwraca `null` gdy przekroczono `MAX_PREFETCH_TILES`. */
export function computeTileRange(lat: number, lon: number, radiusMeters: number): TileRange | null {
  const zoom = zoomForRadius(radiusMeters);
  const range = computeTileRangeForZoom(lat, lon, radiusMeters, zoom);
  if (range.tileCount > MAX_PREFETCH_TILES) return null;
  return range;
}

/**
 * Wyznacza zakresy kafli dla WSZYSTKICH poziomów zoom (np. od minZoom do maxZoom) pokrywających zasięg projektu.
 */
export function computeAllZoomTileRanges(
  lat: number,
  lon: number,
  radiusMeters: number,
  minZoom = 14,
  maxZoom = 20
): TileRange[] {
  const ranges: TileRange[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    ranges.push(computeTileRangeForZoom(lat, lon, radiusMeters, z));
  }
  return ranges;
}

/** Klucz kafla w formacie używanym przez wszystkie menedżery cache (`z/x/y`). */
export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

/** Wylicza zbiór kluczy kafli objętych pojedynczym zakresem — używane do "przypinania" kafli w cache przed eviction. */
export function tileKeysInRange(range: TileRange): Set<string> {
  const keys = new Set<string>();
  for (let tx = range.startTileX; tx <= range.endTileX; tx++) {
    for (let ty = range.startTileY; ty <= range.endTileY; ty++) {
      keys.add(tileKey(range.zoom, tx, ty));
    }
  }
  return keys;
}

/** Wylicza zbiór kluczy kafli objętych wieloma zakresami zoomów. */
export function allTileKeysInRanges(ranges: TileRange[]): Set<string> {
  const keys = new Set<string>();
  for (const range of ranges) {
    for (let tx = range.startTileX; tx <= range.endTileX; tx++) {
      for (let ty = range.startTileY; ty <= range.endTileY; ty++) {
        keys.add(tileKey(range.zoom, tx, ty));
      }
    }
  }
  return keys;
}

export interface ZoomExtentSizeEstimate {
  zoom: number;
  tileCount: number;
  sizeMb: number;
}

export interface ExtentSizeReport {
  radiusMeters: number;
  minZoom: number;
  maxZoom: number;
  totalTiles: number;
  sizeMb: number;
  byZoom: ZoomExtentSizeEstimate[];
}

/**
 * Szacuje wielkość w MB kafli pokrywających okrąg projektu dla wszystkich poziomów zoom.
 * Średni rozmiar kafla to ~25 KB dla JPEG lub ~35 KB dla WMS PNG.
 */
export function estimateProjectExtentTileSizes(
  lat: number,
  lon: number,
  radiusMeters: number,
  minZoom = 14,
  maxZoom = 20,
  avgTileSizeBytes = 25000
): ExtentSizeReport {
  const ranges = computeAllZoomTileRanges(lat, lon, radiusMeters, minZoom, maxZoom);
  let totalTiles = 0;
  const byZoom: ZoomExtentSizeEstimate[] = [];

  for (const r of ranges) {
    totalTiles += r.tileCount;
    const sizeMb = Number(((r.tileCount * avgTileSizeBytes) / (1024 * 1024)).toFixed(2));
    byZoom.push({ zoom: r.zoom, tileCount: r.tileCount, sizeMb });
  }

  const totalSizeMb = Number(((totalTiles * avgTileSizeBytes) / (1024 * 1024)).toFixed(2));

  return {
    radiusMeters,
    minZoom,
    maxZoom,
    totalTiles,
    sizeMb: totalSizeMb,
    byZoom,
  };
}

/**
 * Cache LRU z "przypinaniem" kluczy w zasięgu projektu — wspólna implementacja dla wszystkich
 * menedżerów kafli (Google, HERE, WMS).
 * Kafle spoza `protectedKeys` są usuwane w pierwszej kolejności (od najstarszego), więc zwykłe
 * przewijanie/zoom poza zasięgiem projektu nie wypycha z cache danych, które są w zasięgu.
 */
export class ProtectedLruCache<V> {
  private readonly cache = new Map<string, V>();
  private protectedKeys: Set<string> = new Set();

  constructor(
    private readonly baseMaxSize: number,
    private readonly onEvict?: (key: string, value: V) => void
  ) {}

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

  get size(): number {
    return this.cache.size;
  }

  get protectedSize(): number {
    return this.protectedKeys.size;
  }

  set(key: string, value: V) {
    const effectiveMax = this.baseMaxSize + this.protectedKeys.size;
    if (this.cache.size >= effectiveMax && !this.cache.has(key)) {
      let victim: string | undefined;
      for (const k of this.cache.keys()) {
        if (!this.protectedKeys.has(k)) {
          victim = k;
          break;
        }
      }
      const victimKey = victim ?? this.cache.keys().next().value!;
      const victimVal = this.cache.get(victimKey);
      this.cache.delete(victimKey);
      if (victimVal !== undefined && this.onEvict) {
        this.onEvict(victimKey, victimVal);
      }
    }
    this.cache.set(key, value);
  }

  /** Ustawia zbiór kluczy chronionych przed eviction — wywołaj po każdym prefetchu w nowym zasięgu. */
  setProtectedKeys(keys: Set<string>) {
    this.protectedKeys = keys;
  }

  clear() {
    if (this.onEvict) {
      for (const [k, v] of this.cache.entries()) {
        this.onEvict(k, v);
      }
    }
    this.cache.clear();
    this.protectedKeys.clear();
  }
}
