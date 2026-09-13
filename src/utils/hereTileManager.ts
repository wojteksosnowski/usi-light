/**
 * hereTileManager.ts
 *
 * Menedżer asynchronicznego pobierania i buforowania (LRU Cache) kafelków satelitarnych HERE Maps.
 *
 * Bezpieczeństwo i koszty:
 * - Gdy warstwa jest wyłączona, NIE są wykonywane żadne zapytania sieciowe.
 * - Wykorzystuje HERE Raster Tile API v3 (styl satellite.day — czyste zdjęcia satelitarne bez etykiet).
 */

import { ISatelliteTileManager } from './googleTileManager';
import {
  computeAllZoomTileRanges,
  computeTileRange,
  tileKeysInRange,
  allTileKeysInRanges,
  ProtectedLruCache,
  estimateProjectExtentTileSizes,
  ExtentSizeReport,
} from './tilePrefetchMath';

export class HereTileManager implements ISatelliteTileManager {
  public readonly maxNativeZoom = 19;
  private cache = new ProtectedLruCache<HTMLImageElement>(1200);
  private pendingRequests: Set<string> = new Set();
  private prefetchQueue: { x: number; y: number; z: number; key: string }[] = [];
  private activePrefetches = 0;
  private readonly maxConcurrentPrefetches = 6;
  private onTileLoaded?: () => void;
  private apiKey: string;
  private totalBytesLoaded = 0;
  /** Klucze kafli dociąganych cicho w tle (prefetch) — patrz komentarz w googleTileManager.ts. */
  private silentKeys: Set<string> = new Set();

  constructor(apiKey: string, onTileLoaded?: () => void) {
    this.apiKey = apiKey;
    this.onTileLoaded = onTileLoaded;
  }

  public setApiKey(newKey: string) {
    if (this.apiKey !== newKey) {
      this.apiKey = newKey;
      this.clearCache();
    }
  }

  public setOnTileLoaded(callback: () => void) {
    this.onTileLoaded = callback;
  }

  public clearCache() {
    this.cache.clear();
    this.pendingRequests.clear();
    this.prefetchQueue = [];
    this.silentKeys.clear();
    this.activePrefetches = 0;
    this.totalBytesLoaded = 0;
  }

  public getCacheSizeMb(): number {
    // Średni rozmiar kafelka satelitarnego HERE to ~20 KB (PNG/JPEG)
    return Number(((this.cache.size * 20000) / (1024 * 1024)).toFixed(2));
  }

  public getProjectExtentEstimate(lat: number, lon: number, radiusMeters: number): ExtentSizeReport {
    return estimateProjectExtentTileSizes(lat, lon, radiusMeters, 14, this.maxNativeZoom, 20000);
  }

  /**
   * Sprawdza czy kafel jest już załadowany w pamięci RAM bez inicjowania requestów sieciowych.
   */
  public getTileFromMemory(x: number, y: number, z: number): HTMLImageElement | null {
    const maxTile = Math.pow(2, z);
    const normX = ((x % maxTile) + maxTile) % maxTile;
    const normY = y;

    if (normY < 0 || normY >= maxTile) return null;

    const key = `${z}/${normX}/${normY}`;
    const img = this.cache.get(key);
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  /**
   * Zwraca załadowany obrazek kafelka lub null jeśli kafelek nie jest jeszcze w pamięci.
   * W razie braku, dodaje żądanie do priorytetowej kolejki widoku (z limitem współbieżności).
   */
  public getTile(x: number, y: number, z: number): HTMLImageElement | null {
    const maxTile = Math.pow(2, z);
    const normX = ((x % maxTile) + maxTile) % maxTile;
    const normY = y;

    if (normY < 0 || normY >= maxTile) {
      return null;
    }

    const key = `${z}/${normX}/${normY}`;

    const img = this.cache.get(key);
    if (img && img.complete && img.naturalWidth > 0) {
      return img;
    }

    if (!this.pendingRequests.has(key)) {
      this.pendingRequests.add(key);
      this.prefetchQueue.unshift({ x: normX, y: normY, z, key });
      this.processQueue();
    } else {
      // Kafel jest już w kolejce lub w trakcie pobierania jako cichy prefetch w tle, ale teraz
      // jest realnie potrzebny na ekranie — "odciszamy" go niezależnie od tego, czy nadal czeka
      // w kolejce, czy jest już "w locie".
      this.silentKeys.delete(key);
    }

    return null;
  }

  private loadTile(x: number, y: number, z: number, key: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // HERE Raster Tile API v3 — styl satellite.day
    const cleanKey = this.apiKey ? this.apiKey.trim() : '';
    const url = `https://maps.hereapi.com/v3/base/mc/${z}/${x}/${y}/png8?apiKey=${encodeURIComponent(cleanKey)}&style=satellite.day`;

    img.onload = () => {
      this.pendingRequests.delete(key);
      this.cache.set(key, img);
      this.totalBytesLoaded += 20000;
      this.activePrefetches--;
      // Kafle dociągnięte cicho w tle (prefetch poza bieżącym ekranem) nie wywołują przerysowania —
      // patrz test/zoom_band_transition_profile.test.ts.
      const wasSilent = this.silentKeys.delete(key);
      if (!wasSilent && this.onTileLoaded) {
        this.onTileLoaded();
      }
      this.processQueue();
    };

    img.onerror = () => {
      this.pendingRequests.delete(key);
      this.silentKeys.delete(key);
      this.activePrefetches--;
      this.processQueue();
    };

    img.src = url;
  }

  private processQueue() {
    while (this.activePrefetches < this.maxConcurrentPrefetches && this.prefetchQueue.length > 0) {
      const item = this.prefetchQueue.shift();
      if (!item) break;
      if (this.cache.has(item.key)) {
        this.pendingRequests.delete(item.key);
        this.silentKeys.delete(item.key);
        continue;
      }

      this.activePrefetches++;
      this.loadTile(item.x, item.y, item.z, item.key);
    }
  }

  /**
   * Cichy prefetch kafli dla ustalonego zakresu poziomów zoom (16..20, niezależnie od bieżącego
   * poziomu widoku) w zadanym promieniu projektu — "przypina" klucze w cache (chroni przed
   * eviction) i pobiera je w tle za pośrednictwem kolejki z limitem współbieżności.
   */
  public prefetchAllZoomsInRadius(lat: number, lon: number, radiusMeters: number, minZoom = 16, _currentZoom?: number) {
    const effectiveMinZoom = minZoom;
    const effectiveMaxZoom = Math.min(this.maxNativeZoom, 20);
    const ranges = computeAllZoomTileRanges(lat, lon, radiusMeters, effectiveMinZoom, effectiveMaxZoom);
    this.cache.setProtectedKeys(allTileKeysInRanges(ranges));

    for (const range of ranges) {
      for (let tx = range.startTileX; tx <= range.endTileX; tx++) {
        for (let ty = range.startTileY; ty <= range.endTileY; ty++) {
          const key = `${range.zoom}/${tx}/${ty}`;
          if (!this.cache.has(key) && !this.pendingRequests.has(key)) {
            this.pendingRequests.add(key);
            this.silentKeys.add(key);
            this.prefetchQueue.push({ x: tx, y: ty, z: range.zoom, key });
          }
        }
      }
    }

    this.processQueue();
  }

  public prefetchTilesInRadius(lat: number, lon: number, radiusMeters: number) {
    this.prefetchAllZoomsInRadius(lat, lon, radiusMeters);
  }
}
