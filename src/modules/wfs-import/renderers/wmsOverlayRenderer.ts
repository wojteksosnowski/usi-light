import { CadRenderContext } from '../../../components/cad/types';
import {
  CrsDetectionResult,
  cadPointToWgs84,
  latLonToWebMercatorPixel,
  LatLon,
} from '../../../utils/geoTransform';
import { WmsTileManager } from './wmsTileManager';
import { Point2D } from '../../../types/geometry';
import { APP_CONFIG } from '../../../config/appConfig';
import { TileZoomHysteresis, clampTileRangeEnd, computeTileGridScreenTransform } from '../../../utils/tileGridProjection';

export interface RenderWmsOverlayOptions {
  rc: CadRenderContext;
  tileManager: WmsTileManager;
  crsInfo: CrsDetectionResult;
  projectCenterLatLon?: LatLon;
  opacity?: number;
  /** Promień zasięgu projektu w metrach CAD (środek projektu = (0,0)) */
  projectRadius?: number;
  /** Pomija twarde przycięcie/culling do okręgu zasięgu projektu — używane przez warstwy
   * traktowane jako "podkład satelitarny" (np. ortofotomapa), żeby zachowywały się spójnie
   * z Google/HERE: bufor kafli w promieniu projektu, ale wyświetlanie całej mapy również poza okręgiem. */
  skipRadiusClip?: boolean;
}

/**
 * Sprawdza czy kafelek (prostokąt ekranowy) przecina okrąg projektu.
 * Używa algorytmu "rectangle vs circle" (AABB vs circle).
 */
function tileIntersectsCircle(
  tileSx: number,
  tileSy: number,
  tileSx2: number,
  tileSy2: number,
  circleCx: number,
  circleCy: number,
  circleR: number
): boolean {
  // Znajdź punkt prostokąta najbliższy środkowi okręgu
  const nearX = Math.max(tileSx, Math.min(circleCx, tileSx2));
  const nearY = Math.max(tileSy, Math.min(circleCy, tileSy2));
  const dx = nearX - circleCx;
  const dy = nearY - circleCy;
  return dx * dx + dy * dy <= circleR * circleR;
}

export function renderWmsOverlay(options: RenderWmsOverlayOptions) {
  const { rc, tileManager, crsInfo, projectCenterLatLon, opacity = 0.45, projectRadius, skipRadiusClip = false } = options;
  const { ctx, width, height, viewState, screenToWorld, worldToScreen } = rc;

  const c1 = screenToWorld(0, 0);
  const c2 = screenToWorld(width, 0);
  const c3 = screenToWorld(width, height);
  const c4 = screenToWorld(0, height);

  const cadCorners: Point2D[] = [
    { x: c1.wx, y: c1.wy },
    { x: c2.wx, y: c2.wy },
    { x: c3.wx, y: c3.wy },
    { x: c4.wx, y: c4.wy },
  ];

  const wgsCorners = cadCorners.map((p) =>
    cadPointToWgs84(p, crsInfo, projectCenterLatLon)
  );

  const metersPerPixel = 1 / Math.max(0.0001, viewState.scale);
  const centerLat = wgsCorners[0].lat;
  const metersPerTileAtLat = 40075016.686 * Math.cos((centerLat * Math.PI) / 180);

  const maxAllowedZoom = tileManager.maxNativeZoom ?? 19;
  const exactZoom = Math.log2(metersPerTileAtLat / (256 * metersPerPixel));

  const targetZoom = tileManager.resolveTargetZoom
    ? tileManager.resolveTargetZoom(exactZoom, 2)
    : Math.max(2, Math.min(maxAllowedZoom, Math.round(exactZoom)));

  const mercatorPixels = wgsCorners.map((wgs) => latLonToWebMercatorPixel(wgs, targetZoom));
  const minMercX = Math.min(...mercatorPixels.map((p) => p.x));
  const maxMercX = Math.max(...mercatorPixels.map((p) => p.x));
  const minMercY = Math.min(...mercatorPixels.map((p) => p.y));
  const maxMercY = Math.max(...mercatorPixels.map((p) => p.y));

  const startTileX = Math.floor(minMercX / 256);
  const endTileX = Math.floor(maxMercX / 256);
  const startTileY = Math.floor(minMercY / 256);
  const endTileY = Math.floor(maxMercY / 256);

  // Bezpieczne ograniczenie liczby kafli na klatkę (ochrona przed zawieszeniem przy drastycznym oddaleniu)
  const effectiveEndX = clampTileRangeEnd(startTileX, endTileX);
  const effectiveEndY = clampTileRangeEnd(startTileY, endTileY);

  // Oblicz pozycję środka projektu na ekranie dla clip/culling
  const originSc = worldToScreen(0, 0);
  const radiusPx = projectRadius != null ? projectRadius * viewState.scale : null;

  // 5. Rysuj kafelki za pomocą zoptymalizowanej transformacji afinicznej (bez wolnego ctx.filter)
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1.0, opacity));
  ctx.imageSmoothingEnabled = true;
  // Celowo BEZ imageSmoothingQuality='high' — patrz komentarz w satelliteMapRenderer.ts.

  // Twardy clip canvas do okręgu zasięgu projektu
  if (radiusPx != null && APP_CONFIG.geo.wmsClipToProjectRadius && !skipRadiusClip) {
    ctx.beginPath();
    ctx.arc(originSc.sx, originSc.sy, radiusPx, 0, Math.PI * 2);
    ctx.clip();
  }

  // Jednorazowe wyznaczenie wektorów bazowych siatki kafelków (256px w Mercatorze)
  const { baseSTL, stepXx, stepXy, stepYx, stepYy, vXx, vXy, vYx, vYy } = computeTileGridScreenTransform(
    startTileX,
    startTileY,
    targetZoom,
    crsInfo,
    projectCenterLatLon,
    worldToScreen
  );
  const halfStepXx = stepXx * 0.5;
  const halfStepXy = stepXy * 0.5;
  const halfStepYx = stepYx * 0.5;
  const halfStepYy = stepYy * 0.5;
  const halfDiag = Math.hypot(halfStepXx + halfStepYx, halfStepXy + halfStepYy);
  const checkRadius = radiusPx != null ? radiusPx + halfDiag : null;
  const checkRadiusSq = checkRadius != null ? checkRadius * checkRadius : 0;

  const viewCenterSx = width * 0.5;
  const viewCenterSy = height * 0.5;
  const visibleTiles: { tx: number; ty: number; sTLx: number; sTLy: number; distCenterSq: number }[] = [];

  for (let tx = startTileX; tx <= effectiveEndX; tx++) {
    const dX = tx - startTileX;
    for (let ty = startTileY; ty <= effectiveEndY; ty++) {
      const dY = ty - startTileY;
      const sTLx = baseSTL.sx + dX * stepXx + dY * stepYx;
      const sTLy = baseSTL.sy + dX * stepXy + dY * stepYy;

      // 1. Viewport Frustum Culling — pomijaj kafle całkowicie poza widocznym ekranem [0..width, 0..height]
      const sTRx = sTLx + stepXx;
      const sTRy = sTLy + stepXy;
      const sBLx = sTLx + stepYx;
      const sBLy = sTLy + stepYy;
      const sBRx = sTRx + stepYx;
      const sBRy = sTRy + stepYy;

      const minTileSx = Math.min(sTLx, sTRx, sBLx, sBRx);
      const maxTileSx = Math.max(sTLx, sTRx, sBLx, sBRx);
      const minTileSy = Math.min(sTLy, sTRy, sBLy, sBRy);
      const maxTileSy = Math.max(sTLy, sTRy, sBLy, sBRy);

      if (maxTileSx < 0 || minTileSx > width || maxTileSy < 0 || minTileSy > height) {
        continue;
      }

      const centerSx = sTLx + halfStepXx + halfStepYx;
      const centerSy = sTLy + halfStepXy + halfStepYy;

      // 2. Szybki culling do okręgu projektu (odległość środka kafla od środka projektu na ekranie)
      if (checkRadius != null && APP_CONFIG.geo.wmsTileCullingEnabled && !skipRadiusClip) {
        const distSq = (centerSx - originSc.sx) ** 2 + (centerSy - originSc.sy) ** 2;
        if (distSq > checkRadiusSq) {
          continue;
        }
      }

      const distCenterSq = (centerSx - viewCenterSx) ** 2 + (centerSy - viewCenterSy) ** 2;
      visibleTiles.push({ tx, ty, sTLx, sTLy, distCenterSq });
    }
  }

  // Sortowanie od środka widoku na zewnątrz — kafle w centrum uwagi użytkownika ładują się pierwsze
  if (visibleTiles.length > 1) {
    visibleTiles.sort((a, b) => a.distCenterSq - b.distCenterSq);
  }

  for (let i = 0; i < visibleTiles.length; i++) {
    const { tx, ty, sTLx, sTLy } = visibleTiles[i];
    // Kafelki inwertowane pobierane są bezpośrednio z pamięci podręcznej (OffscreenCanvas), przeliczone
    // przy załadowaniu kafla, nie w tej pętli — bez użycia powolnego ctx.filter per-frame
    const tileImg = tileManager.getTile(tx, ty, targetZoom);

    if (tileImg) {
      ctx.setTransform(vXx, vXy, vYx, vYy, sTLx, sTLy);
      ctx.drawImage(tileImg, 0, 0, 256, 256);
    } else if (targetZoom > 2) {
      // Fallback do kafelka rodzica (zoom - 1) z pamięci RAM (zero żądań sieciowych w pętli renderowania)
      const parentZoom = targetZoom - 1;
      const pTx = Math.floor(tx / 2);
      const pTy = Math.floor(ty / 2);
      const parentImg = tileManager.getTileFromMemory(pTx, pTy, parentZoom);
      if (parentImg) {
        const subX = (tx % 2) * 128;
        const subY = (ty % 2) * 128;
        ctx.setTransform(vXx, vXy, vYx, vYy, sTLx, sTLy);
        ctx.drawImage(parentImg, subX, subY, 128, 128, 0, 0, 256, 256);
      } else if (targetZoom > 3) {
        // Fallback do kafelka dziadka (zoom - 2) z pamięci RAM
        const gpZoom = targetZoom - 2;
        const gpTx = Math.floor(tx / 4);
        const gpTy = Math.floor(ty / 4);
        const gpImg = tileManager.getTileFromMemory(gpTx, gpTy, gpZoom);
        if (gpImg) {
          const subX = (tx % 4) * 64;
          const subY = (ty % 4) * 64;
          ctx.setTransform(vXx, vXy, vYx, vYy, sTLx, sTLy);
          ctx.drawImage(gpImg, subX, subY, 64, 64, 0, 0, 256, 256);
        }
      }
    }
  }

  ctx.restore();
}
