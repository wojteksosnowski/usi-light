/**
 * Powtarzalny test diagnostyczny: płynność renderu kafli satelitarnych/WMS w zakresie
 * widocznego zasięgu 200m -> 100m (jak zgłosił użytkownik: "jeden krok zoomu bliżej i
 * nagle kilka klatek na sekundę"). Uruchom: `npx vitest run test/zoom_step_smoothness_profile.test.ts`.
 *
 * WAŻNE ZASTRZEŻENIE: ten harness działa w Node z zamockowanym DOM/Canvas — `drawImage`
 * i `getContext('2d')` są tu praktycznie darmowe. Mierzy więc WYŁĄCZNIE koszt warstwy
 * JS/logiki (odczyty cache, matematyka siatki kafli, planowanie inwersji kolorów), a NIE
 * realny koszt rasteryzacji Canvas, GPU ani sieci. Jeśli ten test pokazuje "wszystko OK",
 * a w przeglądarce nadal widać zacięcia, winowajca leży poza tym, co ten harness może
 * zmierzyć — patrz checklista ręcznego profilowania niżej.
 *
 * Sweep skali jest CELOWO gęstszy niż realny pojedynczy "tick" kółka myszy
 * (CadCanvas.tsx: zoomFactor = Math.exp(-clampedDelta * 0.0018), ok. 19% zmiany skali na
 * typowy tick) — służy precyzyjnej lokalizacji, przy jakiej dokładnie skali/zoomie
 * pojawia się skok kosztu (np. granica histerezy zoomu, próg 0.35 w tileGridProjection.ts),
 * nie symulacji pojedynczego gestu użytkownika.
 *
 * === Checklista ręcznego profilowania w przeglądarce (uzupełnienie, nie zastępuje testu) ===
 * 1. `npm run dev`, otwórz projekt z włączonymi warstwami: ortofoto + KIUT lub BDOT.
 * 2. Chrome DevTools -> Performance -> Record.
 * 3. Powoli zoomuj kółkiem myszy w zakresie widocznego zasięgu ~200m -> 100m.
 * 4. Stop recording w momencie zauważonego zacięcia.
 * 5. W flame chart sprawdź dominujący wpis w tym momencie: "Image Decode", canvas
 *    drawImage/raster, długie zadania JS w kodzie tile managera, pauzy GC, Style/Layout.
 * 6. Porównaj z tabelą wypisaną przez ten test — czy to ten sam zakres skali/zoomu?
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderSatelliteMap } from '../src/components/cad/renderers/satelliteMapRenderer';
import { renderWmsOverlay } from '../src/modules/wfs-import/renderers/wmsOverlayRenderer';
import { GoogleTileManager } from '../src/utils/googleTileManager';
import { WmsTileManager } from '../src/modules/wfs-import/renderers/wmsTileManager';
import { TileZoomHysteresis } from '../src/utils/tileGridProjection';
import { CrsDetectionResult, LatLon } from '../src/utils/geoTransform';
import { CadRenderContext, ViewportState } from '../src/components/cad/types';

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
    // Symuluje natychmiastowe zakończenie fetchu sieciowego (jak w tile_prefetch_and_caching.test.ts)
    // -> kafle faktycznie trafiają do cache, zamiast być trwałym cache-missem jak w
    // cad_pan_zoom_performance.test.ts (tamten mock celowo nigdy nie odpala onload).
    queueMicrotask(() => this.onload?.());
  }
}

class MockContext2D {
  public globalAlpha = 1.0;
  public imageSmoothingEnabled = true;
  public imageSmoothingQuality: ImageSmoothingQuality = 'high';
  public filter = 'none';

  save() {}
  restore() {}
  beginPath() {}
  arc() {}
  clip() {}
  setTransform() {}
  drawImage() {}
}

class MockCanvas {
  public width = 256;
  public height = 256;
  getContext() {
    return new MockContext2D();
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

function flushMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const VIEWPORT_WIDTH = 1200;
const VIEWPORT_HEIGHT = 900;

function spanMetersToScale(spanMeters: number): number {
  return VIEWPORT_WIDTH / spanMeters;
}

function createMockRenderContext(scale: number, panX = 600, panY = 450): CadRenderContext {
  const ctx = new MockContext2D() as unknown as CanvasRenderingContext2D;
  const viewState: ViewportState = { scale, panX, panY };

  const worldToScreen = (wx: number, wy: number) => ({
    sx: viewState.panX + wx * viewState.scale,
    sy: viewState.panY - wy * viewState.scale,
  });

  const screenToWorld = (sx: number, sy: number) => ({
    wx: (sx - viewState.panX) / viewState.scale,
    wy: -(sy - viewState.panY) / viewState.scale,
  });

  return {
    ctx,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    viewState,
    viewRotationDeg: 0,
    worldToScreen,
    screenToWorld,
    latitude: 52.2297,
    longitude: 21.0122,
    equinoxDate: 'spring',
    sunlightMethod: 'segments',
    isInteracting: false,
  };
}

interface StepMetrics {
  scale: number;
  spanM: number;
  totalMs: number;
  tileLookupMs: number;
  hysteresisMs: number;
  drawCalls: number;
  satelliteFlip: boolean;
  wmsFlip: boolean;
}

describe('Zoom-step smoothness profile (200m -> 100m span, repeatable diagnostic)', () => {
  let getTileTimeSpy: ReturnType<typeof vi.spyOn>[];
  let hysteresisSpy: ReturnType<typeof vi.spyOn>;
  let drawImageSpy: ReturnType<typeof vi.spyOn>;

  const timeBuckets = { tileLookup: 0, hysteresis: 0 };
  let drawCallCount = 0;

  function wrapWithTiming(obj: any, method: string, bucket: keyof typeof timeBuckets) {
    const original = obj[method].bind(obj);
    return vi.spyOn(obj, method).mockImplementation((...args: any[]) => {
      const t0 = performance.now();
      const result = original(...args);
      timeBuckets[bucket] += performance.now() - t0;
      return result;
    });
  }

  beforeEach(() => {
    timeBuckets.tileLookup = 0;
    timeBuckets.hysteresis = 0;
    drawCallCount = 0;
  });

  afterEach(() => {
    getTileTimeSpy?.forEach((s) => s.mockRestore());
    hysteresisSpy?.mockRestore();
    drawImageSpy?.mockRestore();
  });

  it('profiles frame cost across a dense scale sweep from 200m to 100m visible span', async () => {
    const crsInfo: CrsDetectionResult = {
      crs: 'LOCAL',
      description: 'Local CAD coordinate space',
      geodeticLabel: 'Lokalny CAD',
      isGeodetic: false,
      isLocalReference: true,
    };
    const projectCenter: LatLon = { lat: 52.2297, lon: 21.0122 };
    const PROJECT_RADIUS_M = 200; // promień "zasięgu projektu" z prośby użytkownika — wpływa
    // tylko na clipping/protected-keys w prawdziwym kodzie, NIE na widoczny zoom (patrz nagłówek).

    const satelliteTiles = new GoogleTileManager('test-key');
    const kiutLikeTiles = new WmsTileManager({ baseUrl: 'http://example.com/kiut', layers: 'kiut' }, 1200);
    kiutLikeTiles.setInvertColors(true); // odtwarza warstwę KIUT/BDOT zamieszaną w poprzedni błąd
    const orthoLikeTiles = new WmsTileManager({ baseUrl: 'http://example.com/ortho', layers: 'ortho' }, 1200);

    // Instrumentacja: zero zmian w kodzie produkcyjnym, tylko spy.
    getTileTimeSpy = [
      wrapWithTiming(satelliteTiles, 'getTile', 'tileLookup'),
      wrapWithTiming(satelliteTiles, 'getTileFromMemory', 'tileLookup'),
      wrapWithTiming(kiutLikeTiles, 'getTile', 'tileLookup'),
      wrapWithTiming(kiutLikeTiles, 'getTileFromMemory', 'tileLookup'),
      wrapWithTiming(orthoLikeTiles, 'getTile', 'tileLookup'),
      wrapWithTiming(orthoLikeTiles, 'getTileFromMemory', 'tileLookup'),
    ];
    hysteresisSpy = wrapWithTiming(TileZoomHysteresis.prototype, 'resolve', 'hysteresis') as any;
    drawImageSpy = vi.spyOn(MockContext2D.prototype, 'drawImage').mockImplementation(() => {
      drawCallCount++;
    });

    const spanStart = 200;
    const spanEnd = 100;
    const scaleStart = spanMetersToScale(spanStart); // 6
    const scaleEnd = spanMetersToScale(spanEnd); // 12
    const STEPS = 75;
    const stepFactor = Math.pow(scaleEnd / scaleStart, 1 / STEPS);

    const rc = createMockRenderContext(scaleStart);
    const results: StepMetrics[] = [];
    let prevSatelliteZoom: number | null = null;
    let prevWmsZoom: number | null = null;

    for (let step = 0; step <= STEPS; step++) {
      rc.viewState.scale = scaleStart * Math.pow(stepFactor, step);
      const spanM = VIEWPORT_WIDTH / rc.viewState.scale;

      // Pierwszy krok: więcej klatek żeby zbudować realistycznie "ciepły" cache przed sweepem.
      const frameCount = step === 0 ? 12 : 5;

      timeBuckets.tileLookup = 0;
      timeBuckets.hysteresis = 0;
      drawCallCount = 0;

      let totalMs = 0;
      for (let frame = 0; frame < frameCount; frame++) {
        const t0 = performance.now();
        renderSatelliteMap({ rc, tileManager: satelliteTiles, crsInfo, projectCenterLatLon: projectCenter, opacity: 0.65 });
        renderWmsOverlay({ rc, tileManager: kiutLikeTiles, crsInfo, projectCenterLatLon: projectCenter, projectRadius: PROJECT_RADIUS_M, opacity: 0.65 });
        renderWmsOverlay({ rc, tileManager: orthoLikeTiles, crsInfo, projectCenterLatLon: projectCenter, projectRadius: PROJECT_RADIUS_M, skipRadiusClip: true, opacity: 0.65 });
        totalMs += performance.now() - t0;

        await Promise.resolve(); // flush mikrozadań (Image onload)
        await flushMacrotask(); // flush setTimeout(0) (leniwa inwersja KIUT/BDOT)
      }

      // Sprawdź czy w tym kroku doszło do przeskoku histerezy zoomu (satelita/WMS niezależnie).
      const metersPerPixel = 1 / rc.viewState.scale;
      const metersPerTileAtEquator = 40075016.686;
      const exactZoom = Math.log2(metersPerTileAtEquator / (256 * metersPerPixel));
      const approxIntZoom = Math.round(exactZoom);
      const satelliteFlip = prevSatelliteZoom !== null && approxIntZoom !== prevSatelliteZoom;
      const wmsFlip = prevWmsZoom !== null && approxIntZoom !== prevWmsZoom;
      prevSatelliteZoom = approxIntZoom;
      prevWmsZoom = approxIntZoom;

      results.push({
        scale: Number(rc.viewState.scale.toFixed(3)),
        spanM: Number(spanM.toFixed(1)),
        totalMs: Number((totalMs / frameCount).toFixed(3)),
        tileLookupMs: Number((timeBuckets.tileLookup / frameCount).toFixed(3)),
        hysteresisMs: Number((timeBuckets.hysteresis / frameCount).toFixed(4)),
        drawCalls: Math.round(drawCallCount / frameCount),
        satelliteFlip,
        wmsFlip,
      });
    }

    console.table(
      results.map((r) => ({
        scale: r.scale,
        span_m: r.spanM,
        'flip?': r.satelliteFlip || r.wmsFlip ? 'YES' : '',
        'avg total ms/frame': r.totalMs,
        'tile-lookup ms': r.tileLookupMs,
        'hysteresis ms': r.hysteresisMs,
        'other ms': Number((r.totalMs - r.tileLookupMs - r.hysteresisMs).toFixed(3)),
        drawCalls: r.drawCalls,
      }))
    );

    const worstByTotal = results.reduce((a, b) => (b.totalMs > a.totalMs ? b : a));
    const worstByDraws = results.reduce((a, b) => (b.drawCalls > a.drawCalls ? b : a));
    console.log(
      `[ZOOM PROFILE] Worst step by total ms/frame: scale=${worstByTotal.scale} span=${worstByTotal.spanM}m ` +
        `total=${worstByTotal.totalMs}ms (flip=${worstByTotal.satelliteFlip || worstByTotal.wmsFlip})`
    );
    console.log(
      `[ZOOM PROFILE] Worst step by drawImage count: scale=${worstByDraws.scale} span=${worstByDraws.spanM}m ` +
        `drawCalls=${worstByDraws.drawCalls}`
    );

    // Miękkie asercje regresyjne (nie tylko raport) — łapią przyszłe prawdziwe eksplozje kosztu,
    // bez bycia płynnymi na zwykłe wahania pomiarowe w tym syntetycznym środowisku.
    for (const r of results) {
      expect(r.totalMs).toBeLessThan(20);
      // 2 warstwy WMS x maks 17x17=289 kafli + 1 warstwa satelitarna x 289 = teoretyczne maks ~867;
      // hojny sanity-limit łapie regres typu "duplikujące się renderowanie", nie normalny szczyt.
      expect(r.drawCalls).toBeLessThan(900);
    }
  });
});
