/**
 * Uniwersalny menedżer kafelków WMS — wzorzec z GoogleTileManager.
 * Obsługuje dowolne serwisy WMS (NMT, EGiB, BDOT10k).
 */

import {
  computeAllZoomTileRanges,
  computeTileRange,
  tileKeysInRange,
  allTileKeysInRanges,
  ProtectedLruCache,
  estimateProjectExtentTileSizes,
  ExtentSizeReport,
  TileRange,
} from '../../../utils/tilePrefetchMath';
import { TileZoomHysteresis } from '../../../utils/tileGridProjection';

export interface WmsTileConfig {
  baseUrl: string;
  mirrors?: string[];
  layers: string;
  format?: string;
  crs?: string;
  tileSize?: number;
  maxNativeZoom?: number;
}

const DEFAULT_CONFIG: Partial<WmsTileConfig> = {
  format: 'image/png',
  crs: 'EPSG:3857',
  tileSize: 256,
  maxNativeZoom: 21,
};

export class WmsTileManager {
  public readonly maxNativeZoom: number;
  private cache: ProtectedLruCache<HTMLImageElement>;
  private pending: Set<string> = new Set();
  private prefetchQueue: { x: number; y: number; z: number; key: string }[] = [];
  private activePrefetches = 0;
  /** Klucze kafli dociąganych cicho w tle (prefetch) — patrz komentarz w googleTileManager.ts.
   * Trzymane osobno od kolejki, bo kolejka jest opróżniana (shift) w momencie startu pobierania. */
  private silentKeys: Set<string> = new Set();
  /** Klucze przypięte w cache przez pełny prefetch zasięgu projektu (`extentKeys`) oraz przez
   * startowy warm-up wąskiego pasma zoomów (`warmupKeys`). `ProtectedLruCache.setProtectedKeys`
   * NADPISUJE cały zbiór, więc oba źródła muszą być łączone sumą (applyProtectedKeys) — inaczej
   * warm-up odpiąłby kafle wysokich zoomów pobrane wcześniej dla już włączonej warstwy. */
  private extentKeys: Set<string> = new Set();
  private warmupKeys: Set<string> = new Set();
  private readonly maxConcurrentPrefetches = 4;
  private config: WmsTileConfig;
  private onTileLoaded?: () => void;
  private totalBytesLoaded = 0;
  private invertColors = false;
  private zoomHysteresis = new TileZoomHysteresis();
  private requestIndex = 0;

  constructor(config: WmsTileConfig, maxCacheSize = 1200, onTileLoaded?: () => void) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.maxNativeZoom = this.config.maxNativeZoom ?? 19;
    this.cache = new ProtectedLruCache<HTMLImageElement>(maxCacheSize, (key) => {
      this.invertedCache.delete(key);
      this.invertPending.delete(key);
    });
    this.onTileLoaded = onTileLoaded;
  }

  private invertedCache = new Map<string, CanvasImageSource>();
  private invertPending: Set<string> = new Set();
  private invertQueue: { key: string; img: HTMLImageElement }[] = [];
  private invertTimerScheduled = false;

  public resolveTargetZoom(exactZoom: number, minZoom = 2): number {
    return this.zoomHysteresis.resolve(exactZoom, minZoom, this.maxNativeZoom);
  }

  setOnTileLoaded(callback: () => void) {
    this.onTileLoaded = callback;
  }

  /**
   * Włącza/wyłącza odwrócenie kolorów kafli (dla warstw KIUT/BDOT na białym tle).
   * Odwrócone wersje liczone są leniwie i asynchronicznie, tylko dla kafli faktycznie
   * odczytanych przez renderer (patrz computeAndCacheInversion) — nigdy synchronicznie
   * w pętli renderu, i nigdy dla całego tła prefetchu (które obejmuje kafle spoza ekranu).
   */
  setInvertColors(invert: boolean) {
    if (this.invertColors === invert) return;
    this.invertColors = invert;
    // Stan sprzed przełączenia jest nieaktualny — dociągnie się leniwie w getTileFromMemory.
    this.invertedCache.clear();
    this.invertPending.clear();
    this.invertQueue = [];
  }

  private scheduleInversionProcess() {
    if (this.invertTimerScheduled) return;
    this.invertTimerScheduled = true;
    const processBatch = () => {
      this.invertTimerScheduled = false;
      const startTime = performance.now();
      // Budżet czasu max 3ms na klatkę, aby inwersja nigdy nie powodowała janku (spadku klatek)
      while (this.invertQueue.length > 0 && performance.now() - startTime < 3) {
        const item = this.invertQueue.shift();
        if (item && !this.invertedCache.has(item.key)) {
          this.computeAndCacheInversion(item.key, item.img);
        }
      }
      if (this.invertQueue.length > 0) {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(processBatch, { timeout: 50 });
        } else {
          setTimeout(processBatch, 4);
        }
      } else {
        this.onTileLoaded?.();
      }
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(processBatch, { timeout: 50 });
    } else {
      setTimeout(processBatch, 0);
    }
  }

  /** Liczy i buforuje odwróconą kolorystycznie wersję kafla. Wołane WYŁĄCZNIE leniwie, dla kafli
   * faktycznie odczytanych przez renderer (nie dla całego tła prefetchu) — inaczej przy warstwach
   * KIUT/BDOT każdy kafel dociągnięty w tle na dowolnym poziomie zoomu w promieniu projektu
   * (potencjalnie tysiące, w większości nigdy niewidocznych na ekranie) zostałby zainwertowany
   * od razu przy załadowaniu, zalewając główny wątek pracą Canvasu niezwiązaną z bieżącą klatką. */
  private computeAndCacheInversion(key: string, img: HTMLImageElement) {
    this.invertPending.delete(key);
    if (this.invertedCache.has(key)) return;
    try {
      const w = img.naturalWidth || 256;
      const h = img.naturalHeight || 256;
      let offscreen: HTMLCanvasElement | OffscreenCanvas;
      let offCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
      if (typeof OffscreenCanvas !== 'undefined') {
        offscreen = new OffscreenCanvas(w, h);
        offCtx = offscreen.getContext('2d');
      } else {
        offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        offCtx = offscreen.getContext('2d');
      }
      if (offCtx) {
        offCtx.filter = 'invert(1) hue-rotate(180deg)';
        offCtx.drawImage(img, 0, 0);
        this.invertedCache.set(key, offscreen as CanvasImageSource);
      }
    } catch {
      // Brak wsparcia dla Canvas filter w tym środowisku — zostaje surowy obraz.
    }
  }

  clearCache() {
    this.cache.clear();
    this.invertedCache.clear();
    this.invertPending.clear();
    this.invertQueue = [];
    this.pending.clear();
    this.prefetchQueue = [];
    this.silentKeys.clear();
    this.extentKeys.clear();
    this.warmupKeys.clear();
    this.activePrefetches = 0;
    this.totalBytesLoaded = 0;
  }

  public getCacheSizeMb(): number {
    // Średni rozmiar kafelka WMS (zależnie czy PNG czy JPEG, np. ~35 KB)
    const avgSize = this.config.format === 'image/jpeg' ? 22000 : 35000;
    return Number(((this.cache.size * avgSize) / (1024 * 1024)).toFixed(2));
  }

  public getProjectExtentEstimate(lat: number, lon: number, radiusMeters: number): ExtentSizeReport {
    const avgSize = this.config.format === 'image/jpeg' ? 22000 : 35000;
    return estimateProjectExtentTileSizes(lat, lon, radiusMeters, 14, this.maxNativeZoom, avgSize);
  }

  /**
   * Sprawdza czy kafel jest już załadowany w pamięci RAM bez inicjowania requestów sieciowych.
   */
  getTileFromMemory(x: number, y: number, z: number): CanvasImageSource | null {
    const maxTile = Math.pow(2, z);
    const normX = ((x % maxTile) + maxTile) % maxTile;
    const normY = y;

    if (normY < 0 || normY >= maxTile) return null;

    const key = `${z}/${normX}/${normY}`;
    const img = this.cache.get(key);
    if (img && img.complete && img.naturalWidth > 0) {
      if (!this.invertColors) return img;
      const cachedInverted = this.invertedCache.get(key);
      if (cachedInverted) return cachedInverted;
      // Jeszcze nieprzeliczone — zwróć surowy kafel na tę klatkę i zakolejkuj wersję odwróconą w tle
      // z podziałem na małe porcje czasu (time-sliced), bez blokowania bieżącej klatki.
      if (!this.invertPending.has(key)) {
        this.invertPending.add(key);
        this.invertQueue.push({ key, img });
        this.scheduleInversionProcess();
      }
      return img;
    }
    return null;
  }

  /**
   * Zwraca załadowany obrazek kafelka lub null jeśli kafelek nie jest jeszcze w pamięci.
   * W razie braku, dodaje żądanie do priorytetowej kolejki widoku (z limitem współbieżności).
   */
  getTile(x: number, y: number, z: number): CanvasImageSource | null {
    const maxTile = Math.pow(2, z);
    const normX = ((x % maxTile) + maxTile) % maxTile;
    const normY = y;

    if (normY < 0 || normY >= maxTile) return null;

    const key = `${z}/${normX}/${normY}`;

    const cached = this.getTileFromMemory(x, y, z);
    if (cached) return cached;

    if (!this.pending.has(key)) {
      this.pending.add(key);
      this.prefetchQueue.unshift({ x: normX, y: normY, z, key });
      this.processQueue();
    } else {
      // Kafel jest już w kolejce lub w trakcie pobierania jako cichy prefetch w tle, ale teraz
      // jest realnie potrzebny na ekranie — "odciszamy" go niezależnie od tego, czy nadal czeka
      // w kolejce, czy jest już "w locie" (dispatched, poza tablicą prefetchQueue).
      this.silentKeys.delete(key);
      // Szybka promocja widoku: jeśli kafel czeka w dalszej części kolejki prefetchu,
      // przesuń go na sam początek (indeks 0), aby został pobrany natychmiast na najbliższym slocie sieciowym.
      const qIdx = this.prefetchQueue.findIndex((item) => item.key === key);
      if (qIdx > 0) {
        const [promoted] = this.prefetchQueue.splice(qIdx, 1);
        if (promoted) {
          this.prefetchQueue.unshift(promoted);
        }
      }
    }

    return null;
  }

  private getEffectiveBaseUrl(): string {
    const { baseUrl, mirrors } = this.config;
    if (mirrors && mirrors.length > 0) {
      return mirrors[this.requestIndex++ % mirrors.length];
    }
    return baseUrl;
  }

  private loadTile(x: number, y: number, z: number, key: string) {
    const { layers, format, crs, tileSize } = this.config;
    const effectiveBaseUrl = this.getEffectiveBaseUrl();
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
      // Inwersja NIE liczy się tutaj — większość kafli ładowanych w tle (prefetch w promieniu
      // projektu na wielu poziomach zoomu) nigdy nie trafia na ekran. Liczymy ją leniwie, tylko
      // dla kafli faktycznie odczytanych przez renderer (getTileFromMemory).
      this.totalBytesLoaded += format === 'image/jpeg' ? 22000 : 35000;
      this.activePrefetches--;
      // Kafle dociągnięte cicho w tle (prefetch poza bieżącym ekranem) nie wywołują przerysowania —
      // inaczej setki kafli ładujących się w tle po zatrzymaniu zoomu wymuszałyby ciągłe
      // przerysowanie całego pipeline'u przez cały czas trwania prefetchu (patrz regresja opisana
      // w test/zoom_band_transition_profile.test.ts).
      const wasSilent = this.silentKeys.delete(key);
      if (!wasSilent) this.onTileLoaded?.();
      this.processQueue();
    };

    img.onerror = () => {
      this.pending.delete(key);
      this.silentKeys.delete(key);
      this.activePrefetches--;
      this.processQueue();
    };

    img.src = `${effectiveBaseUrl}?${params}`;
  }

  private processQueue() {
    while (this.activePrefetches < this.maxConcurrentPrefetches && this.prefetchQueue.length > 0) {
      const item = this.prefetchQueue.shift();
      if (!item) break;
      if (this.cache.has(item.key)) {
        this.pending.delete(item.key);
        this.silentKeys.delete(item.key);
        continue;
      }

      this.activePrefetches++;
      this.loadTile(item.x, item.y, item.z, item.key);
    }
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

  /** Kolejkuje ciche pobranie kafli z zadanych zakresów zoomów (bez przerysowania po załadowaniu). */
  private enqueueSilentTiles(ranges: TileRange[]) {
    for (const range of ranges) {
      for (let tx = range.startTileX; tx <= range.endTileX; tx++) {
        for (let ty = range.startTileY; ty <= range.endTileY; ty++) {
          const key = `${range.zoom}/${tx}/${ty}`;
          if (!this.cache.has(key) && !this.pending.has(key)) {
            this.pending.add(key);
            this.silentKeys.add(key);
            this.prefetchQueue.push({ x: tx, y: ty, z: range.zoom, key });
          }
        }
      }
    }

    this.processQueue();
  }

  /** Przypina w cache sumę kluczy zasięgu projektu i warm-upu (setProtectedKeys nadpisuje zbiór). */
  private applyProtectedKeys() {
    const merged = new Set<string>(this.extentKeys);
    for (const key of this.warmupKeys) merged.add(key);
    this.cache.setProtectedKeys(merged);
  }

  /**
   * Cichy prefetch kafli dla ustalonego zakresu poziomów zoom (16..20, niezależnie od bieżącego
   * poziomu widoku) w zadanym promieniu projektu — "przypina" klucze w cache (chroni przed
   * eviction) i pobiera je w tle za pośrednictwem kolejki z limitem współbieżności.
   */
  public prefetchAllZoomsInRadius(lat: number, lon: number, radiusMeters: number, minZoom = 16, _currentZoom?: number) {
    const effectiveMinZoom = minZoom;
    const effectiveMaxZoom = Math.min(this.maxNativeZoom, 22);
    const ranges = computeAllZoomTileRanges(lat, lon, radiusMeters, effectiveMinZoom, effectiveMaxZoom);
    this.extentKeys = allTileKeysInRanges(ranges);
    this.applyProtectedKeys();
    this.enqueueSilentTiles(ranges);
  }

  /**
   * Cichy warm-up WĄSKIEGO pasma poziomów zoom (pasmo startowe konfigurowane w
   * `APP_CONFIG.geo.wmsWarmupZoomMin/Max`) w zasięgu projektu — napełnia bufor zanim warstwa
   * zostanie włączona przez użytkownika, żeby pierwsze klatki po włączeniu korzystały z kafli
   * obecnych w RAM. Dolne poziomy pasma są przydatne niezależnie od bieżącej skali: renderer sięga
   * po kafel rodzica (zoom - 1) i dziadka (zoom - 2) jako fallback, gdy docelowy jeszcze nie dojechał.
   */
  public prefetchZoomBandInRadius(lat: number, lon: number, radiusMeters: number, minZoom: number, maxZoom: number) {
    const effectiveMinZoom = Math.min(minZoom, this.maxNativeZoom);
    const effectiveMaxZoom = Math.min(maxZoom, this.maxNativeZoom);
    if (effectiveMaxZoom < effectiveMinZoom) return;

    const ranges = computeAllZoomTileRanges(lat, lon, radiusMeters, effectiveMinZoom, effectiveMaxZoom);
    this.warmupKeys = allTileKeysInRanges(ranges);
    this.applyProtectedKeys();
    this.enqueueSilentTiles(ranges);
  }

  public prefetchTilesInRadius(lat: number, lon: number, radiusMeters: number, currentZoom?: number) {
    this.prefetchAllZoomsInRadius(lat, lon, radiusMeters, 16, currentZoom);
  }
}
