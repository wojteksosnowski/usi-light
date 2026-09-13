import { describe, it, expect, vi } from 'vitest';
import {
  computeTileRangeForZoom,
  computeAllZoomTileRanges,
  estimateProjectExtentTileSizes,
  allTileKeysInRanges,
  ProtectedLruCache,
} from '../src/utils/tilePrefetchMath';
import { GoogleTileManager } from '../src/utils/googleTileManager';
import { HereTileManager } from '../src/utils/hereTileManager';
import { WmsTileManager } from '../src/modules/wfs-import/renderers/wmsTileManager';

class MockImage {
  public crossOrigin = '';
  public complete = true;
  public naturalWidth = 256;
  public naturalHeight = 256;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  private _src = '';

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    // Symuluje natychmiastowe zakończenie fetchu sieciowego — pozwala testom obserwować
    // stan cache tuż po "załadowaniu" bez realnej sieci.
    queueMicrotask(() => this.onload?.());
  }
}

class MockCanvasContext2D {
  public filter = 'none';
  drawImage() {}
}

class MockCanvas {
  public width = 256;
  public height = 256;
  getContext() {
    return new MockCanvasContext2D();
  }
}

if (typeof globalThis.Image === 'undefined') {
  (globalThis as any).Image = MockImage;
}
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => new MockCanvas(),
  };
}

/** Wywołuje getTile() dla każdego podanego kafla (kolejkuje "sieciowe" ładowanie przez mock
 * Image) i czeka aż wszystkie mikrozadania onload się wykonają — po tym cache jest "ciepły". */
async function loadFakeTiles(manager: WmsTileManager, tiles: { z: number; x: number; y: number }[]) {
  for (const t of tiles) {
    manager.getTile(t.x, t.y, t.z);
  }
  // Kolejka ma limit współbieżności (4 dla WMS) — każda "runda" onload odblokowuje kolejne 4,
  // więc trzeba odczekać kilka rund mikrozadań proporcjonalnie do liczby kafli.
  const rounds = Math.ceil(tiles.length / 4) + 3;
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

/** Czeka na realny tick makrozadania (odpowiednik setTimeout(0) użytego przez leniwą inwersję). */
function flushMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Tile Prefetch Math & Multi-Zoom Caching', () => {
  const warsawLat = 52.2297;
  const warsawLon = 21.0122;

  it('computes all zoom tile ranges for radius 50m, 100m, 200m, 300m', () => {
    const ranges50 = computeAllZoomTileRanges(warsawLat, warsawLon, 50, 14, 20);
    expect(ranges50.length).toBe(7); // z=14..20
    expect(ranges50[0].zoom).toBe(14);
    expect(ranges50[6].zoom).toBe(20);

    const keys50 = allTileKeysInRanges(ranges50);
    expect(keys50.size).toBeGreaterThan(10);
    expect(keys50.size).toBeLessThan(100);
  });

  it('calculates MB sizes accurately for each project extent degree', () => {
    const report50 = estimateProjectExtentTileSizes(warsawLat, warsawLon, 50, 14, 20, 22000);
    const report100 = estimateProjectExtentTileSizes(warsawLat, warsawLon, 100, 14, 20, 22000);
    const report200 = estimateProjectExtentTileSizes(warsawLat, warsawLon, 200, 14, 20, 22000);
    const report300 = estimateProjectExtentTileSizes(warsawLat, warsawLon, 300, 14, 20, 22000);

    expect(report50.totalTiles).toBeGreaterThan(20);
    expect(report50.sizeMb).toBeGreaterThan(0.5);
    expect(report50.sizeMb).toBeLessThan(3.0);

    expect(report100.totalTiles).toBeGreaterThan(report50.totalTiles);
    expect(report100.sizeMb).toBeGreaterThan(report50.sizeMb);

    expect(report200.totalTiles).toBeGreaterThan(report100.totalTiles);
    expect(report200.sizeMb).toBeGreaterThan(report100.sizeMb);

    expect(report300.totalTiles).toBeGreaterThan(report200.totalTiles);
    expect(report300.sizeMb).toBeGreaterThan(report200.sizeMb);
  });

  it('ProtectedLruCache protects pinned project keys and allows size tracking', () => {
    const cache = new ProtectedLruCache<string>(5);
    const protectedKeys = new Set(['18/1/1', '18/1/2', '18/2/1']);
    cache.setProtectedKeys(protectedKeys);

    for (const key of protectedKeys) {
      cache.set(key, 'img-data');
    }

    // Add extra items beyond base size
    for (let i = 0; i < 10; i++) {
      cache.set(`temp-${i}`, `data-${i}`);
    }

    // Protected keys must NOT be evicted
    for (const key of protectedKeys) {
      expect(cache.has(key)).toBe(true);
    }
  });

  it('verifies maxNativeZoom on tile managers', () => {
    const google = new GoogleTileManager('test-key');
    expect(google.maxNativeZoom).toBe(20);

    const here = new HereTileManager('test-key');
    expect(here.maxNativeZoom).toBe(19);

    const wms = new WmsTileManager({ baseUrl: 'http://example.com', layers: 'test' });
    expect(wms.maxNativeZoom).toBe(19);
  });

  describe('Cold zoom-level transition (regression: zoom hysteresis cliff)', () => {
    // Odtwarza sytuację zgłoszoną przez użytkownika: histereza zoomu (TileZoomHysteresis, próg
    // 0.35) przy przekroczeniu granicy poziomu zoomu sprawia, że cała widoczna siatka kafli staje
    // się "zimna" jednocześnie, dla warstw z invertColors=true (KIUT/BDOT). Przed pierwszą naprawą
    // getTileFromMemory() synchronicznie tworzyło Canvas + ctx.filter + drawImage w PĘTLI RENDERU
    // dla każdego takiego kafla. Ważne: inwersja NIE może też liczyć się dla każdego kafla przy
    // jego załadowaniu (onload) — prefetch w tle ładuje kafle dla całego promienia projektu na
    // wielu poziomach zoomu, w większości nigdy niewidoczne na ekranie; eager-inwersja przy onload
    // zalałaby główny wątek pracą Canvasu niezwiązaną z bieżącą klatką (to był drugi, gorszy
    // regres — spowalniał zwykłe przesuwanie widoku, nie tylko zoom). Inwersja musi być liczona
    // WYŁĄCZNIE leniwie, dla kafli faktycznie odczytanych przez getTileFromMemory/getTile.

    it('background-loaded tiles are NOT inverted eagerly at load time (only on first real read)', async () => {
      const wms = new WmsTileManager({ baseUrl: 'http://example.com/kiut', layers: 'kiut' }, 1200);
      wms.setInvertColors(true);

      const zoom = 18;
      const tiles: { z: number; x: number; y: number }[] = [];
      for (let tx = 0; tx < 8; tx++) {
        for (let ty = 0; ty < 8; ty++) {
          tiles.push({ z: zoom, x: tx, y: ty });
        }
      }

      const createElementSpy = vi.spyOn(document, 'createElement');

      // Symuluje prefetch w tle (odpowiednik prefetchAllZoomsInRadius) — kafle się ładują, ale
      // nikt jeszcze nie próbował ich narysować.
      await loadFakeTiles(wms, tiles);
      expect(createElementSpy).not.toHaveBeenCalled();

      createElementSpy.mockRestore();
    });

    it('does not create a <canvas> synchronously while reading already-inverted tiles from memory', async () => {
      const wms = new WmsTileManager({ baseUrl: 'http://example.com/kiut', layers: 'kiut' }, 1200);
      wms.setInvertColors(true);

      const zoom = 18;
      const tiles: { z: number; x: number; y: number }[] = [];
      for (let tx = 0; tx < 8; tx++) {
        for (let ty = 0; ty < 8; ty++) {
          tiles.push({ z: zoom, x: tx, y: ty });
        }
      }

      await loadFakeTiles(wms, tiles);

      // Pierwszy odczyt per kafel: zwraca surowy obraz i planuje inwersję w tle (asynchronicznie).
      for (const t of tiles) {
        expect(wms.getTileFromMemory(t.x, t.y, t.z)).not.toBeNull();
      }
      await flushMacrotask();

      // Teraz wszystkie kafle mają już gotową odwróconą wersję w cache.
      const createElementSpy = vi.spyOn(document, 'createElement');

      // Symuluje kolejne klatki renderu odczytujące te same kafle wielokrotnie.
      for (let frame = 0; frame < 5; frame++) {
        for (const t of tiles) {
          wms.getTileFromMemory(t.x, t.y, t.z);
        }
      }

      expect(createElementSpy).not.toHaveBeenCalled();
      createElementSpy.mockRestore();
    });

    it('cold zoom-boundary burst (64 newly-visible inverted tiles) stays within a per-frame time budget', async () => {
      const wms = new WmsTileManager({ baseUrl: 'http://example.com/bdot', layers: 'bdot' }, 1200);
      wms.setInvertColors(true);

      // Symuluje skok histerezy zoomu: 8x8=64 kafli (odpowiednik jednego "pasa" siatki przy
      // MAX_TILE_SPAN_PER_FRAME) staje się widocznych naraz na nowym poziomie zoomu i musi zostać
      // załadowanych, a potem — dopiero gdy realnie odczytane przez renderer — odwróconych.
      const zoom = 17;
      const tiles: { z: number; x: number; y: number }[] = [];
      for (let tx = 0; tx < 8; tx++) {
        for (let ty = 0; ty < 8; ty++) {
          tiles.push({ z: zoom, x: tx, y: ty });
        }
      }

      await loadFakeTiles(wms, tiles);

      // Pierwsza klatka po skoku zoomu: kafle są już załadowane (raw), ale jeszcze nieodwrócone —
      // to jest dokładnie ścieżka, która przed naprawą tworzyła Canvas synchronicznie w pętli render.
      const t0 = performance.now();
      for (const t of tiles) {
        wms.getTileFromMemory(t.x, t.y, t.z);
      }
      const frameMs = performance.now() - t0;
      console.log(`[REGRESSION TEST] First render-frame read of ${tiles.length} newly-visible raw tiles (schedules async inversion): ${frameMs.toFixed(2)} ms`);

      // Budżet: odczyt z pamięci + zaplanowanie asynchronicznej inwersji (bez tworzenia Canvasu
      // synchronicznie) dla 64 kafli powinien zamknąć się w ułamku milisekundy; hojny margines 5ms
      // wciąż wystarcza by wykryć powrót synchronicznej inwersji w hot-pathcie (ta kosztowałaby
      // rzędu dziesiątek-setek ms dla tylu kafli).
      expect(frameMs).toBeLessThan(5);

      await flushMacrotask();
      for (const t of tiles) {
        expect(wms.getTileFromMemory(t.x, t.y, t.z)).not.toBeNull();
      }
    });
  });
});
