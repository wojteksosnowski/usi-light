import { CadRenderContext } from '../../../components/cad/types';
import {
  CrsDetectionResult,
  cadPointToWgs84,
  latLonToWebMercatorPixel,
  webMercatorPixelToLatLon,
  wgs84ToCadPoint,
  LatLon,
} from '../../../utils/geoTransform';
import { WmsTileManager } from './wmsTileManager';
import { Point2D } from '../../../types/geometry';

export interface RenderWmsOverlayOptions {
  rc: CadRenderContext;
  tileManager: WmsTileManager;
  crsInfo: CrsDetectionResult;
  projectCenterLatLon?: LatLon;
  opacity?: number;
}

export function renderWmsOverlay(options: RenderWmsOverlayOptions) {
  const { rc, tileManager, crsInfo, projectCenterLatLon, opacity = 0.45 } = options;
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

  let targetZoom = Math.round(Math.log2(metersPerTileAtLat / (256 * metersPerPixel)));
  targetZoom = Math.max(2, Math.min(21, targetZoom));

  const mercatorPixels = wgsCorners.map((wgs) => latLonToWebMercatorPixel(wgs, targetZoom));
  const minMercX = Math.min(...mercatorPixels.map((p) => p.x));
  const maxMercX = Math.max(...mercatorPixels.map((p) => p.x));
  const minMercY = Math.min(...mercatorPixels.map((p) => p.y));
  const maxMercY = Math.max(...mercatorPixels.map((p) => p.y));

  const startTileX = Math.floor(minMercX / 256);
  const endTileX = Math.floor(maxMercX / 256);
  const startTileY = Math.floor(minMercY / 256);
  const endTileY = Math.floor(maxMercY / 256);

  if ((endTileX - startTileX + 1) * (endTileY - startTileY + 1) > 120) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1.0, opacity));
  ctx.imageSmoothingEnabled = true;

  for (let tx = startTileX; tx <= endTileX; tx++) {
    for (let ty = startTileY; ty <= endTileY; ty++) {
      const tileImg = tileManager.getTile(tx, ty, targetZoom);
      if (!tileImg) continue;

      const wgsTL = webMercatorPixelToLatLon({ x: tx * 256, y: ty * 256 }, targetZoom);
      const wgsTR = webMercatorPixelToLatLon({ x: (tx + 1) * 256, y: ty * 256 }, targetZoom);
      const wgsBL = webMercatorPixelToLatLon({ x: tx * 256, y: (ty + 1) * 256 }, targetZoom);

      const cadTL = wgs84ToCadPoint(wgsTL, crsInfo, projectCenterLatLon);
      const cadTR = wgs84ToCadPoint(wgsTR, crsInfo, projectCenterLatLon);
      const cadBL = wgs84ToCadPoint(wgsBL, crsInfo, projectCenterLatLon);

      const sTL = worldToScreen(cadTL.x, cadTL.y);
      const sTR = worldToScreen(cadTR.x, cadTR.y);
      const sBL = worldToScreen(cadBL.x, cadBL.y);

      const vXx = (sTR.sx - sTL.sx) / 256;
      const vXy = (sTR.sy - sTL.sy) / 256;
      const vYx = (sBL.sx - sTL.sx) / 256;
      const vYy = (sBL.sy - sTL.sy) / 256;

      ctx.save();
      ctx.setTransform(vXx, vXy, vYx, vYy, sTL.sx, sTL.sy);
      ctx.drawImage(tileImg, 0, 0, 256, 256);
      ctx.restore();
    }
  }

  ctx.restore();
}
