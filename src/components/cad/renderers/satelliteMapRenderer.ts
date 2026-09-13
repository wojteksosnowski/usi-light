/**
 * satelliteMapRenderer.ts
 *
 * Renderuje podkład satelitarny Google Maps na Canvasie CAD:
 * - Działa na samym spodzie sceny (zaraz po wyczyszczeniu tła, przed siatką CAD).
 * - Przelicza widoczny obszar ekranu (z uwzględnieniem pan, zoom i dowolnego obrotu) na kafelki Web Mercator.
 * - Rysuje kafelki za pomocą transformacji afinicznej Canvas (ctx.setTransform),
 *   dzięki czemu kafelki obracają się płynnie razem z widokiem CAD bez jakichkolwiek
 *   zniekształceń, spłaszczeń czy efektu patchworku.
 */

import { CadRenderContext } from '../types';
import {
  CrsDetectionResult,
  cadPointToWgs84,
  latLonToWebMercatorPixel,
  LatLon,
} from '../../../utils/geoTransform';
import { ISatelliteTileManager } from '../../../utils/googleTileManager';
import { Point2D } from '../../../types/geometry';
import { TileZoomHysteresis, clampTileRangeEnd, computeTileGridScreenTransform } from '../../../utils/tileGridProjection';

export interface RenderSatelliteMapOptions {
  rc: CadRenderContext;
  tileManager: ISatelliteTileManager;
  crsInfo: CrsDetectionResult;
  projectCenterLatLon?: LatLon;
  opacity?: number;
}

export function renderSatelliteMap(options: RenderSatelliteMapOptions) {
  const {
    rc,
    tileManager,
    crsInfo,
    projectCenterLatLon,
    opacity = 0.65,
  } = options;

  const { ctx, width, height, viewState, screenToWorld, worldToScreen } = rc;

  // 1. Wyznacz 4 narożniki widocznego okna ekranu w przestrzeni CAD
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

  // 2. Przelicz narożniki CAD na współrzędne geograficzne WGS84
  const wgsCorners = cadCorners.map((p) =>
    cadPointToWgs84(p, crsInfo, projectCenterLatLon)
  );

  // 3. Wyznacz optymalny poziom zoomu z histerezą +/-0.35 (zapobiega skokom rozdzielczości na granicach skali)
  const metersPerPixel = 1 / Math.max(0.0001, viewState.scale);
  const centerLat = wgsCorners[0].lat;
  const metersPerTileAtEquator = 40075016.686;
  const metersPerTileAtLat = metersPerTileAtEquator * Math.cos((centerLat * Math.PI) / 180);

  const maxAllowedZoom = tileManager.maxNativeZoom ?? 20;
  const exactZoom = Math.log2(metersPerTileAtLat / (256 * metersPerPixel));

  const targetZoom = tileManager.resolveTargetZoom
    ? tileManager.resolveTargetZoom(exactZoom, 2)
    : Math.max(2, Math.min(maxAllowedZoom, Math.round(exactZoom)));

  // 4. Wyznacz zakres kafelków (minTileX..maxTileX, minTileY..maxTileY)
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

  // 5. Rysuj kafelki za pomocą zoptymalizowanej transformacji afinicznej
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1.0, opacity));
  ctx.imageSmoothingEnabled = true;
  // Celowo BEZ imageSmoothingQuality='high' — przy powiększaniu (upscaling) kafli powyżej
  // natywnych 256px 'high' jest realnym Canvas 2D wąskim gardłem na niektórych silnikach
  // (np. Microsoft Edge), niewidocznym w testach z zamockowanym/headless Canvas. Domyślna
  // jakość ('low') jest najszybsza i w praktyce nieodróżnialna dla rastrów satelitarnych.
  // main (bez tej linii) działa płynnie na produkcji — to jedyna realna różnica w hot-pathcie.

  // Jednorazowe wyznaczenie wektorów bazowych siatki kafelków (256px w Mercatorze)
  const { baseSTL, stepXx, stepXy, stepYx, stepYy, vXx, vXy, vYx, vYy } = computeTileGridScreenTransform(
    startTileX,
    startTileY,
    targetZoom,
    crsInfo,
    projectCenterLatLon,
    worldToScreen
  );

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

      const tileImg = tileManager.getTile(tx, ty, targetZoom);

      if (tileImg) {
        ctx.setTransform(vXx, vXy, vYx, vYy, sTLx, sTLy);
        ctx.drawImage(tileImg, 0, 0, 256, 256);
      } else if (targetZoom > 2) {
        // 1. Sprawdź kafel rodzica (z-1) w pamięci RAM (zero zapytań sieciowych dla fallbacku)
        const parentZoom = targetZoom - 1;
        const pTx = Math.floor(tx / 2);
        const pTy = Math.floor(ty / 2);
        const parentImg = tileManager.getTileFromMemory ? tileManager.getTileFromMemory(pTx, pTy, parentZoom) : null;
        if (parentImg) {
          const subX = (tx % 2) * 128;
          const subY = (ty % 2) * 128;
          ctx.setTransform(vXx, vXy, vYx, vYy, sTLx, sTLy);
          ctx.drawImage(parentImg, subX, subY, 128, 128, 0, 0, 256, 256);
        } else if (targetZoom > 3) {
          // 2. Sprawdź kafel dziadka (z-2) w pamięci RAM
          const gpZoom = targetZoom - 2;
          const gpTx = Math.floor(tx / 4);
          const gpTy = Math.floor(ty / 4);
          const gpImg = tileManager.getTileFromMemory ? tileManager.getTileFromMemory(gpTx, gpTy, gpZoom) : null;
          if (gpImg) {
            const subX = (tx % 4) * 64;
            const subY = (ty % 4) * 64;
            ctx.setTransform(vXx, vXy, vYx, vYy, sTLx, sTLy);
            ctx.drawImage(gpImg, subX, subY, 64, 64, 0, 0, 256, 256);
          }
        }
      }
    }
  }

  ctx.restore();
}
