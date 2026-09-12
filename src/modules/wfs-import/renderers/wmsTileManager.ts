/**
 * Uniwersalny menedżer kafelków WMS — wzorzec z GoogleTileManager.
 * Obsługuje dowolne serwisy WMS (NMT, EGiB, BDOT10k).
 */

import { computeTileRange, tileKeysInRange, ProtectedLruCache } from '../../../utils/tilePrefetchMath';

export interface WmsTileConfig {
  baseUrl: string;
  layers: string;
  format?: string;
  crs?: string;
  tileSize?: number;
}

const DEFAULT_CONFIG: Partial<WmsTileConfig> = {
  format: 'image/png',
  crs: 'EPSG:3857',
  tileSize: 256,
};

export class WmsTileManager {
  private cache: ProtectedLruCache<HTMLImageElement>;
  private pending: Set<string> = new Set();
  private config: WmsTileConfig;
  private onTileLoaded?: () => void;

  constructor(config: WmsTileConfig, maxCacheSize = 200, onTileLoaded?: () => void) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new ProtectedLruCache<HTMLImageElement>(maxCacheSize);
    this.onTileLoaded = onTileLoaded;
  }

  setOnTileLoaded(callback: () => void) {
    this.onTileLoaded = callback;
  }

  clearCache() {
    this.cache.clear();
    this.pending.clear();
  }

  getTile(x: number, y: number, z: number): HTMLImageElement | null {
    const maxTile = Math.pow(2, z);
    const normX = ((x % maxTile) + maxTile) % maxTile;
    const normY = y;

    if (normY < 0 || normY >= maxTile) return null;

    const key = `${z}/${normX}/${normY}`;

    const img = this.cache.get(key);
    if (img) {
      return img.complete && img.naturalWidth > 0 ? img : null;
    }

    if (!this.pending.has(key)) {
      this.pending.add(key);
      this.loadTile(normX, normY, z, key);
    }

    return null;
  }

  private loadTile(x: number, y: number, z: number, key: string) {
    const { baseUrl, layers, format, crs, tileSize } = this.config;
    const size = tileSize || 256;

    const bbox = this.tileToBbox3857(x, y, z);
    const params = new URLSearchParams({
      service: 'WMS',
      version: '1.3.0',
      request: 'GetMap',
      layers,
      styles: '',
      bbox: bbox.join(','),
      width: String(size),
      height: String(size),
      crs: crs || 'EPSG:3857',
      format: format || 'image/png',
      transparent: 'true',
    });

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      this.pending.delete(key);
      this.cache.set(key, img);
      this.onTileLoaded?.();
    };

    img.onerror = () => {
      this.pending.delete(key);
    };

    img.src = `${baseUrl}?${params}`;
  }

  private tileToBbox3857(x: number, y: number, z: number): [number, number, number, number] {
    const origin = 20037508.342789244;
    const tileSize = (2 * origin) / Math.pow(2, z);
    const minX = -origin + x * tileSize;
    const maxX = minX + tileSize;
    const maxY = origin - y * tileSize;
    const minY = maxY - tileSize;
    return [minX, minY, maxX, maxY];
  }

  /**
   * Prefetch kafli WMS w obszarze okręgu wokół punktu geograficznego, i "przypięcie" ich kluczy
   * w cache tak, by przetrwały zwykłe przewijanie/zoom poza zasięgiem projektu. Wywołaj po zmianie
   * środka/promienia projektu lub włączeniu warstwy, żeby kafle były zawsze gotowe bez przewijania.
   */
  prefetchTilesInRadius(lat: number, lon: number, radiusMeters: number) {
    const range = computeTileRange(lat, lon, radiusMeters);
    if (!range) return;

    this.cache.setProtectedKeys(tileKeysInRange(range));

    for (let tx = range.startTileX; tx <= range.endTileX; tx++) {
      for (let ty = range.startTileY; ty <= range.endTileY; ty++) {
        this.getTile(tx, ty, range.zoom);
      }
    }
  }
}
