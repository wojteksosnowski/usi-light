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
  webMercatorPixelToLatLon,
  wgs84ToCadPoint,
  LatLon,
} from '../../../utils/geoTransform';
import { GoogleTileManager } from '../../../utils/googleTileManager';
import { Point2D } from '../../../types/geometry';

export interface RenderSatelliteMapOptions {
  rc: CadRenderContext;
  tileManager: GoogleTileManager;
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

  // 3. Wyznacz optymalny poziom zoomu Web Mercator
  // Oblicz ile metrów świata odpowiada jednemu pikselowi ekranu: metersPerPixel = 1 / scale
  const metersPerPixel = 1 / Math.max(0.0001, viewState.scale);
  const centerLat = wgsCorners[0].lat;
  const metersPerTileAtEquator = 40075016.686;
  const metersPerTileAtLat = metersPerTileAtEquator * Math.cos((centerLat * Math.PI) / 180);

  // zoom = log2(metersPerTileAtLat / (256 * metersPerPixel))
  let targetZoom = Math.round(Math.log2(metersPerTileAtLat / (256 * metersPerPixel)));
  targetZoom = Math.max(2, Math.min(21, targetZoom));

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

  // Zabezpieczenie przed zbyt dużą liczbą kafelków naraz (np. przy silnym oddaleniu)
  const tileCountX = endTileX - startTileX + 1;
  const tileCountY = endTileY - startTileY + 1;
  if (tileCountX * tileCountY > 120) {
    return;
  }

  // 5. Rysuj kafelki za pomocą transformacji afinicznej
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1.0, opacity));
  ctx.imageSmoothingEnabled = true;

  for (let tx = startTileX; tx <= endTileX; tx++) {
    for (let ty = startTileY; ty <= endTileY; ty++) {
      const tileImg = tileManager.getTile(tx, ty, targetZoom);
      if (!tileImg) continue;

      // Narożniki kafelka w pikselach Web Mercator (rozmiar 256x256)
      const mercTL = { x: tx * 256, y: ty * 256 };
      const mercTR = { x: (tx + 1) * 256, y: ty * 256 };
      const mercBL = { x: tx * 256, y: (ty + 1) * 256 };

      // Przeliczenie narożników na WGS84
      const wgsTL = webMercatorPixelToLatLon(mercTL, targetZoom);
      const wgsTR = webMercatorPixelToLatLon(mercTR, targetZoom);
      const wgsBL = webMercatorPixelToLatLon(mercBL, targetZoom);

      // Przeliczenie na współrzędne CAD świata
      const cadTL = wgs84ToCadPoint(wgsTL, crsInfo, projectCenterLatLon);
      const cadTR = wgs84ToCadPoint(wgsTR, crsInfo, projectCenterLatLon);
      const cadBL = wgs84ToCadPoint(wgsBL, crsInfo, projectCenterLatLon);

      // Przeliczenie na współrzędne ekranu (uwzględniające skalę, pan oraz obrót viewRotationDeg)
      const sTL = worldToScreen(cadTL.x, cadTL.y);
      const sTR = worldToScreen(cadTR.x, cadTR.y);
      const sBL = worldToScreen(cadBL.x, cadBL.y);

      // Wektory bazowe kafelka na ekranie (dla osi X i Y obrazu 256x256)
      const vXx = (sTR.sx - sTL.sx) / 256;
      const vXy = (sTR.sy - sTL.sy) / 256;
      const vYx = (sBL.sx - sTL.sx) / 256;
      const vYy = (sBL.sy - sTL.sy) / 256;

      // Zastosowanie macierzy transformacji 2D: [vXx, vXy, vYx, vYy, sTL.sx, sTL.sy]
      ctx.save();
      ctx.setTransform(vXx, vXy, vYx, vYy, sTL.sx, sTL.sy);
      ctx.drawImage(tileImg, 0, 0, 256, 256);
      ctx.restore();
    }
  }

  ctx.restore();
}
