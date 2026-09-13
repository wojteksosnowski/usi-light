import { renderSatelliteMap } from '../src/components/cad/renderers/satelliteMapRenderer';
import { renderWmsOverlay } from '../src/modules/wfs-import/renderers/wmsOverlayRenderer';
import { GoogleTileManager } from '../src/utils/googleTileManager';
import { WmsTileManager } from '../src/modules/wfs-import/renderers/wmsTileManager';
import { TileZoomHysteresis } from '../src/utils/tileGridProjection';
import { CrsDetectionResult, LatLon } from '../src/utils/geoTransform';
import { CadRenderContext, ViewportState } from '../src/components/cad/types';

// Endpoints z konfiguracji aplikacji
const ORTO_WMS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolutionTime';
const KIUT_WMS_URL = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu';
const BDOT_WMS_URL = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaBazDanychObiektowTopograficznych';

const VIEWPORT_WIDTH = 1200;
const VIEWPORT_HEIGHT = 900;

export interface StepProfileResult {
  step: number;
  scale: number;
  spanM: number;
  exactZoom: number;
  targetZoom: number;
  zoomFlip: boolean;
  frameDurationsMs: number[];
  avgFrameMs: number;
  maxFrameMs: number;
  minFrameMs: number;
  drawCalls: number;
  satelliteDraws: number;
  orthoDraws: number;
  kiutDraws: number;
  bdotDraws: number;
  inversionsPending: number;
  inversionsCached: number;
  longTasksCount: number;
  longTasksTotalMs: number;
}

export interface ProfileRunOptions {
  startSpanM?: number;
  endSpanM?: number;
  steps?: number;
  settleMsPerStep?: number;
  framesPerStep?: number;
  lat?: number;
  lon?: number;
  projectRadius?: number;
  enableOrtho?: boolean;
  enableKiut?: boolean;
  enableBdot?: boolean;
  enableSatellite?: boolean;
}

const canvas = document.getElementById('cad-canvas') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLElement;
const ctx = canvas.getContext('2d')!;

let drawCallCounter = {
  total: 0,
  satellite: 0,
  ortho: 0,
  kiut: 0,
  bdot: 0,
  currentLayer: 'none' as 'satellite' | 'ortho' | 'kiut' | 'bdot' | 'none',
};

// Instrumentacja drawImage
const originalDrawImage = ctx.drawImage.bind(ctx);
ctx.drawImage = function (...args: any[]) {
  drawCallCounter.total++;
  if (drawCallCounter.currentLayer === 'satellite') drawCallCounter.satellite++;
  else if (drawCallCounter.currentLayer === 'ortho') drawCallCounter.ortho++;
  else if (drawCallCounter.currentLayer === 'kiut') drawCallCounter.kiut++;
  else if (drawCallCounter.currentLayer === 'bdot') drawCallCounter.bdot++;
  return (originalDrawImage as any).apply(ctx, args);
};

// LongTask observer
let observedLongTasks: { duration: number; startTime: number }[] = [];
if (typeof PerformanceObserver !== 'undefined') {
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        observedLongTasks.push({ duration: entry.duration, startTime: entry.startTime });
      }
    });
    po.observe({ entryTypes: ['longtask'] });
  } catch (e) {
    console.warn('LongTask observer not supported in this context', e);
  }
}

function spanMetersToScale(spanMeters: number): number {
  return VIEWPORT_WIDTH / spanMeters;
}

export async function runProfile(options: ProfileRunOptions = {}): Promise<StepProfileResult[]> {
  const {
    startSpanM = 200,
    endSpanM = 100,
    steps = 50,
    settleMsPerStep = 60,
    framesPerStep = 6,
    lat = 52.2297,
    lon = 21.0122,
    projectRadius = 200,
    enableOrtho = true,
    enableKiut = true,
    enableBdot = true,
    enableSatellite = true,
  } = options;

  statusEl.textContent = 'Inicjalizacja warstw kafli...';

  const crsInfo: CrsDetectionResult = {
    crs: 'LOCAL',
    description: 'Local CAD coordinate space',
    geodeticLabel: 'Lokalny CAD',
    isGeodetic: false,
    isLocalReference: true,
  };
  const projectCenter: LatLon = { lat, lon };

  // Inicjalizacja TileManagerów z realnymi URL-ami
  const satelliteTiles = new GoogleTileManager('benchmark-key');
  const orthoTiles = new WmsTileManager({
    baseUrl: ORTO_WMS_URL,
    layers: 'Image',
    format: 'image/jpeg',
  }, 1200);

  const kiutTiles = new WmsTileManager({
    baseUrl: KIUT_WMS_URL,
    layers: 'gesut,przewod_wodociagowy,przewod_kanalizacyjny,przewod_gazowy,przewod_elektroenergetyczny,przewod_cieplowniczy,przewod_telekomunikacyjny,przewod_urzadzenia',
    format: 'image/png',
  }, 1200);
  kiutTiles.setInvertColors(true);

  const bdotTiles = new WmsTileManager({
    baseUrl: BDOT_WMS_URL,
    layers: 'bdot',
    format: 'image/png',
  }, 1200);
  bdotTiles.setInvertColors(true);

  // Prefetch początkowy na 200m
  statusEl.textContent = 'Pobieranie wstępnych kafli...';
  if (enableOrtho) orthoTiles.prefetchTilesInRadius(lat, lon, projectRadius);
  if (enableKiut) kiutTiles.prefetchTilesInRadius(lat, lon, projectRadius);
  if (enableBdot) bdotTiles.prefetchTilesInRadius(lat, lon, projectRadius);

  // Poczekaj chwilę na pierwsze kafle
  await new Promise((r) => setTimeout(r, 1500));

  const scaleStart = spanMetersToScale(startSpanM);
  const scaleEnd = spanMetersToScale(endSpanM);
  const stepFactor = Math.pow(scaleEnd / scaleStart, 1 / steps);

  const viewState: ViewportState = { scale: scaleStart, panX: 600, panY: 450 };
  const worldToScreen = (wx: number, wy: number) => ({
    sx: viewState.panX + wx * viewState.scale,
    sy: viewState.panY - wy * viewState.scale,
  });
  const screenToWorld = (sx: number, sy: number) => ({
    wx: (sx - viewState.panX) / viewState.scale,
    wy: -(sy - viewState.panY) / viewState.scale,
  });

  const rc: CadRenderContext = {
    ctx,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    viewState,
    viewRotationDeg: 0,
    worldToScreen,
    screenToWorld,
    latitude: lat,
    longitude: lon,
    equinoxDate: 'spring',
    sunlightMethod: 'segments',
    isInteracting: false,
  };

  (window as any).__lastRc = rc;
  (window as any).__orthoTiles = orthoTiles;
  (window as any).__kiutTiles = kiutTiles;
  (window as any).__bdotTiles = bdotTiles;
  (window as any).__crsInfo = crsInfo;
  (window as any).__projectCenter = projectCenter;

  const results: StepProfileResult[] = [];
  let prevZoom: number | null = null;

  for (let step = 0; step <= steps; step++) {
    viewState.scale = scaleStart * Math.pow(stepFactor, step);
    const spanM = VIEWPORT_WIDTH / viewState.scale;

    statusEl.textContent = `Krok ${step}/${steps} — Skala: ${viewState.scale.toFixed(2)} (${spanM.toFixed(1)}m)`;

    // Odczekaj czas osadzania/pobierania kafelków w tle
    if (settleMsPerStep > 0) {
      await new Promise((r) => setTimeout(r, settleMsPerStep));
    }

    observedLongTasks = [];
    const frameDurations: number[] = [];
    drawCallCounter = { total: 0, satellite: 0, ortho: 0, kiut: 0, bdot: 0, currentLayer: 'none' };

    const metersPerPixel = 1 / Math.max(0.0001, viewState.scale);
    const metersPerTileAtLat = 40075016.686 * Math.cos((lat * Math.PI) / 180);
    const exactZoom = Math.log2(metersPerTileAtLat / (256 * metersPerPixel));
    const targetZoom = orthoTiles.resolveTargetZoom(exactZoom);
    const zoomFlip = prevZoom !== null && targetZoom !== prevZoom;
    prevZoom = targetZoom;

    for (let f = 0; f < framesPerStep; f++) {
      // Czekaj na kolejną klatkę rAF
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const t0 = performance.now();

      // Czyść tło
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

      if (enableSatellite) {
        drawCallCounter.currentLayer = 'satellite';
        renderSatelliteMap({ rc, tileManager: satelliteTiles, crsInfo, projectCenterLatLon: projectCenter, opacity: 0.65 });
      }

      if (enableOrtho) {
        drawCallCounter.currentLayer = 'ortho';
        renderWmsOverlay({ rc, tileManager: orthoTiles, crsInfo, projectCenterLatLon: projectCenter, projectRadius, skipRadiusClip: true, opacity: 0.85 });
      }

      if (enableKiut) {
        drawCallCounter.currentLayer = 'kiut';
        renderWmsOverlay({ rc, tileManager: kiutTiles, crsInfo, projectCenterLatLon: projectCenter, projectRadius, opacity: 0.65 });
      }

      if (enableBdot) {
        drawCallCounter.currentLayer = 'bdot';
        renderWmsOverlay({ rc, tileManager: bdotTiles, crsInfo, projectCenterLatLon: projectCenter, projectRadius, opacity: 0.60 });
      }

      drawCallCounter.currentLayer = 'none';
      const frameDuration = performance.now() - t0;
      frameDurations.push(frameDuration);
    }

    const avgFrameMs = frameDurations.reduce((a, b) => a + b, 0) / frameDurations.length;
    const maxFrameMs = Math.max(...frameDurations);
    const minFrameMs = Math.min(...frameDurations);

    const longTasksTotalMs = observedLongTasks.reduce((acc, lt) => acc + lt.duration, 0);

    const kiutInvertPending = (kiutTiles as any).invertPending ? (kiutTiles as any).invertPending.size : 0;
    const kiutInvertCached = (kiutTiles as any).invertedCache ? (kiutTiles as any).invertedCache.size : 0;
    const bdotInvertPending = (bdotTiles as any).invertPending ? (bdotTiles as any).invertPending.size : 0;
    const bdotInvertCached = (bdotTiles as any).invertedCache ? (bdotTiles as any).invertedCache.size : 0;

    results.push({
      step,
      scale: Number(viewState.scale.toFixed(3)),
      spanM: Number(spanM.toFixed(1)),
      exactZoom: Number(exactZoom.toFixed(3)),
      targetZoom,
      zoomFlip,
      frameDurationsMs: frameDurations.map((d) => Number(d.toFixed(2))),
      avgFrameMs: Number(avgFrameMs.toFixed(3)),
      maxFrameMs: Number(maxFrameMs.toFixed(3)),
      minFrameMs: Number(minFrameMs.toFixed(3)),
      drawCalls: Math.round(drawCallCounter.total / framesPerStep),
      satelliteDraws: Math.round(drawCallCounter.satellite / framesPerStep),
      orthoDraws: Math.round(drawCallCounter.ortho / framesPerStep),
      kiutDraws: Math.round(drawCallCounter.kiut / framesPerStep),
      bdotDraws: Math.round(drawCallCounter.bdot / framesPerStep),
      inversionsPending: kiutInvertPending + bdotInvertPending,
      inversionsCached: kiutInvertCached + bdotInvertCached,
      longTasksCount: observedLongTasks.length,
      longTasksTotalMs: Number(longTasksTotalMs.toFixed(2)),
    });
  }

  statusEl.textContent = 'Profilowanie zakończone pomyślnie!';
  return results;
}

// Live interactive wheel handler
window.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Przeładuj z aktualnym stanem
  const activeRc: CadRenderContext = (window as any).__lastRc;
  if (activeRc) {
    const prevScale = activeRc.viewState.scale;
    const newScale = Math.max(0.1, Math.min(200, prevScale * zoomFactor));
    activeRc.viewState.panX = mouseX - (mouseX - activeRc.viewState.panX) * (newScale / prevScale);
    activeRc.viewState.panY = mouseY - (mouseY - activeRc.viewState.panY) * (newScale / prevScale);
    activeRc.viewState.scale = newScale;

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    const ortho = (window as any).__orthoTiles;
    const kiut = (window as any).__kiutTiles;
    const bdot = (window as any).__bdotTiles;
    const crsInfo = (window as any).__crsInfo;
    const projectCenter = (window as any).__projectCenter;
    if (ortho) renderWmsOverlay({ rc: activeRc, tileManager: ortho, crsInfo, projectCenterLatLon: projectCenter, projectRadius: 200, skipRadiusClip: true, opacity: 0.85 });
    if (kiut) renderWmsOverlay({ rc: activeRc, tileManager: kiut, crsInfo, projectCenterLatLon: projectCenter, projectRadius: 200, opacity: 0.65 });
    if (bdot) renderWmsOverlay({ rc: activeRc, tileManager: bdot, crsInfo, projectCenterLatLon: projectCenter, projectRadius: 200, opacity: 0.60 });
  }
}, { passive: false });

(window as any).__runZoomProfile = async (options: ProfileRunOptions = {}) => {
  const res = await runProfile(options);
  return res;
};
statusEl.textContent = 'Gotowy do profilowania Playwright.';
