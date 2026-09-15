/**
 * Wspólna matematyka rzutowania siatki kafli Web Mercator na ekran CAD (pan/zoom/obrót),
 * dzielona przez renderer satelitarny i renderer WMS — obie warstwy rysują kafle 256x256
 * przez tę samą transformację afiniczną Canvas.
 */

import { CrsDetectionResult, LatLon, wgs84ToCadPoint, webMercatorPixelToLatLon } from './geoTransform';

type ScreenPoint = { sx: number; sy: number };

const ZOOM_HYSTERESIS_THRESHOLD = 0.35;

/** Wygładza skoki poziomu zoomu kafli: utrzymuje poprzedni zoom dopóki różnica z dokładnym
 * zoomem nie przekroczy progu histerezy — zapobiega migotaniu rozdzielczości na granicach skali. */
export class TileZoomHysteresis {
  private lastZoom: number | null = null;

  resolve(exactZoom: number, minZoom: number, maxZoom: number): number {
    let targetZoom: number;
    if (this.lastZoom !== null && Math.abs(exactZoom - this.lastZoom) < ZOOM_HYSTERESIS_THRESHOLD) {
      targetZoom = this.lastZoom;
    } else {
      targetZoom = Math.round(exactZoom);
      this.lastZoom = targetZoom;
    }
    return Math.max(minZoom, Math.min(maxZoom, targetZoom));
  }
}

/** Ogranicza zakres kafli rysowanych w jednej klatce (ochrona przed zawieszeniem przy drastycznym oddaleniu). */
export const MAX_TILE_SPAN_PER_FRAME = 16;

export function clampTileRangeEnd(start: number, end: number, maxSpan = MAX_TILE_SPAN_PER_FRAME): number {
  return Math.min(end, start + maxSpan);
}

export interface TileGridScreenTransform {
  baseSTL: ScreenPoint;
  stepXx: number;
  stepXy: number;
  stepYx: number;
  stepYy: number;
  vXx: number;
  vXy: number;
  vYx: number;
  vYy: number;
}

/**
 * Wyznacza wektory bazowe siatki kafli 256x256 na ekranie: pozycję lewego-górnego rogu
 * kafla (startTileX, startTileY) oraz wektory kroku o 1 kafel w osi X/Y, uwzględniając
 * dowolny obrót/pan/zoom widoku CAD. Wyliczane raz na klatkę, potem współdzielone przez
 * wszystkie kafle w pętli rysowania.
 */
export function computeTileGridScreenTransform(
  startTileX: number,
  startTileY: number,
  targetZoom: number,
  crsInfo: CrsDetectionResult,
  projectCenterLatLon: LatLon | undefined,
  worldToScreen: (wx: number, wy: number) => ScreenPoint
): TileGridScreenTransform {
  const baseMercTL = { x: startTileX * 256, y: startTileY * 256 };
  const baseMercTR = { x: (startTileX + 1) * 256, y: startTileY * 256 };
  const baseMercBL = { x: startTileX * 256, y: (startTileY + 1) * 256 };

  const baseCadTL = wgs84ToCadPoint(webMercatorPixelToLatLon(baseMercTL, targetZoom), crsInfo, projectCenterLatLon);
  const baseCadTR = wgs84ToCadPoint(webMercatorPixelToLatLon(baseMercTR, targetZoom), crsInfo, projectCenterLatLon);
  const baseCadBL = wgs84ToCadPoint(webMercatorPixelToLatLon(baseMercBL, targetZoom), crsInfo, projectCenterLatLon);

  const baseSTL = worldToScreen(baseCadTL.x, baseCadTL.y);
  const baseSTR = worldToScreen(baseCadTR.x, baseCadTR.y);
  const baseSBL = worldToScreen(baseCadBL.x, baseCadBL.y);

  const stepXx = baseSTR.sx - baseSTL.sx;
  const stepXy = baseSTR.sy - baseSTL.sy;
  const stepYx = baseSBL.sx - baseSTL.sx;
  const stepYy = baseSBL.sy - baseSTL.sy;

  return {
    baseSTL,
    stepXx,
    stepXy,
    stepYx,
    stepYy,
    vXx: stepXx / 256,
    vXy: stepXy / 256,
    vYx: stepYx / 256,
    vYy: stepYy / 256,
  };
}
