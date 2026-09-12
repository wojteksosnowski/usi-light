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
import { computeTileRange, tileKeysInRange, ProtectedLruCache } from './tilePrefetchMath';

export class HereTileManager implements ISatelliteTileManager {
  private cache = new ProtectedLruCache<HTMLImageElement>(200);
  private pendingRequests: Set<string> = new Set();
  private onTileLoaded?: () => void;
  private apiKey: string;

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
  }

  /**
   * Zwraca załadowany obrazek kafelka lub null jeśli kafelek nie jest jeszcze w pamięci.
   * W razie braku, rozpoczyna asynchroniczne pobieranie.
   */
  public getTile(x: number, y: number, z: number): HTMLImageElement | null {
    // Normalizacja współrzędnych kafelka (zawijanie w osi X dla sfery)
    const maxTile = Math.pow(2, z);
    const normX = ((x % maxTile) + maxTile) % maxTile;
    const normY = y;

    if (normY < 0 || normY >= maxTile) {
      return null;
    }

    const key = `${z}/${normX}/${normY}`;

    const img = this.cache.get(key);
    if (img) {
      return img.complete && img.naturalWidth > 0 ? img : null;
    }

    if (!this.pendingRequests.has(key)) {
      this.pendingRequests.add(key);
      this.loadTile(normX, normY, z, key);
    }

    return null;
  }

  private loadTile(x: number, y: number, z: number, key: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // HERE Raster Tile API v3 — styl satellite.day (wyłącznie zdjęcia satelitarne, bez etykiet/wektorów)
    const cleanKey = this.apiKey ? this.apiKey.trim() : '';
    const url = `https://maps.hereapi.com/v3/base/mc/${z}/${x}/${y}/png8?apiKey=${encodeURIComponent(cleanKey)}&style=satellite.day`;

    img.onload = () => {
      this.pendingRequests.delete(key);
      this.cache.set(key, img);
      if (this.onTileLoaded) {
        this.onTileLoaded();
      }
    };

    img.onerror = () => {
      this.pendingRequests.delete(key);
      // Nie dodajemy uszkodzonego kafelka do cache, by umożliwić ponowną próbę przy następnym odświeżeniu
    };

    img.src = url;
  }

  /**
   * Prefetch kafelków satelitarnych w obszarze okręgu wokół punktu geograficznego, i "przypięcie"
   * ich kluczy w cache tak, by przetrwały zwykłe przewijanie/zoom poza zasięgiem projektu.
   * Wywołaj po zmianie środka/promienia projektu, żeby kafelki były zawsze gotowe bez scrollowania.
   *
   * @param lat     szerokość geograficzna środka (WGS84)
   * @param lon     długość geograficzna środka (WGS84)
   * @param radiusMeters  promień okręgu w metrach
   */
  public prefetchTilesInRadius(lat: number, lon: number, radiusMeters: number) {
    const range = computeTileRange(lat, lon, radiusMeters);
    if (!range) return;

    this.cache.setProtectedKeys(tileKeysInRange(range));

    for (let tx = range.startTileX; tx <= range.endTileX; tx++) {
      for (let ty = range.startTileY; ty <= range.endTileY; ty++) {
        // getTile() automatycznie startuje download jeśli kafelka nie ma w cache
        this.getTile(tx, ty, range.zoom);
      }
    }
  }
}
