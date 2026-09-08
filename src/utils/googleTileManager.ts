/**
 * googleTileManager.ts
 *
 * Menedżer asynchronicznego pobierania i buforowania (LRU Cache) kafelków satelitarnych Google Maps.
 *
 * Bezpieczeństwo i koszty:
 * - Gdy warstwa jest wyłączona, NIE są wykonywane żadne zapytania sieciowe.
 * - Wykorzystuje standardowy raster kafelkowy Google Maps lub Google Maps 2D Tile API.
 */

export interface TileKey {
  x: number;
  y: number;
  z: number;
}

export class GoogleTileManager {
  private cache: Map<string, HTMLImageElement> = new Map();
  private pendingRequests: Set<string> = new Set();
  private maxCacheSize: number = 200;
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

    if (this.cache.has(key)) {
      const img = this.cache.get(key)!;
      // Odśwież pozycję w LRU cache (delete + set)
      this.cache.delete(key);
      this.cache.set(key, img);
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

    // Endpoint satelitarny Google Maps z kluczem API
    // Obsługuje format lyrs=s (satellite) lub lyrs=y (hybrid)
    const cleanKey = this.apiKey ? this.apiKey.trim() : '';
    const keyParam = cleanKey ? `&key=${encodeURIComponent(cleanKey)}` : '';
    const url = `https://mt1.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}${keyParam}`;

    img.onload = () => {
      this.pendingRequests.delete(key);
      this.addToCache(key, img);
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

  private addToCache(key: string, img: HTMLImageElement) {
    if (this.cache.size >= this.maxCacheSize) {
      // Usuń najstarszy wpis (pierwszy klucz w Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, img);
  }

  /**
   * Prefetch kafelków satelitarnych w obszarze okręgu wokół punktu geograficznego.
   * Wywołaj po zakończeniu synchronizacji geo, aby kafelki były gotowe bez scrollowania.
   *
   * @param lat     szerokość geograficzna środka (WGS84)
   * @param lon     długość geograficzna środka (WGS84)
   * @param radiusMeters  promień okręgu w metrach
   */
  public prefetchTilesInRadius(lat: number, lon: number, radiusMeters: number) {
    // Dobierz zoom do promienia: małe obszary wymagają wyższego zoomu
    const zoom = radiusMeters <= 100 ? 18 : radiusMeters <= 200 ? 17 : radiusMeters <= 500 ? 16 : 15;

    // Oblicz bounding box okręgu w stopniach geograficznych
    const latDelta = radiusMeters / 111320;
    const lonDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));

    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLon = lon - lonDelta;
    const maxLon = lon + lonDelta;

    // Konwersja narożników bbox na piksele Web Mercator
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

    // Ogranicz liczbę kafelków do prefetchu (zabezpieczenie)
    const tileCount = (endTileX - startTileX + 1) * (endTileY - startTileY + 1);
    if (tileCount > 200) return;

    for (let tx = startTileX; tx <= endTileX; tx++) {
      for (let ty = startTileY; ty <= endTileY; ty++) {
        // getTile() automatycznie startuje download jeśli kafelka nie ma w cache
        this.getTile(tx, ty, zoom);
      }
    }
  }
}
