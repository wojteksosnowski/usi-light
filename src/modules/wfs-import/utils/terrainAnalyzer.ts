import { BuildingLoop, Point2D } from '../../../types/geometry';
import { cadPointToWgs84, CrsDetectionResult, LatLon } from '../../../utils/geoTransform';
import { wgs84ToEpsg2180 } from './wgs84ToEpsg2180';
import { AaigridData, fetchDsmBbox, fetchDtmBbox } from '../services/wcsGugikClient';

export function sampleGrid(grid: AaigridData, x: number, y: number): number {
  const col = Math.round((x - grid.xllcorner) / grid.cellsize);
  const row = Math.round((y - grid.yllcorner) / grid.cellsize);
  if (col < 0 || col >= grid.ncols || row < 0 || row >= grid.nrows) return grid.nodata;
  const val = grid.data[row * grid.ncols + col];
  return val === grid.nodata ? NaN : val;
}

export function computeBuildingBbox(
  building: BuildingLoop,
  crsInfo: CrsDetectionResult
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of building.vertices) {
    const wgs = cadPointToWgs84(v, crsInfo);
    const epsg = wgs84ToEpsg2180(wgs.lat, wgs.lon);
    if (epsg.x < minX) minX = epsg.x;
    if (epsg.y < minY) minY = epsg.y;
    if (epsg.x > maxX) maxX = epsg.x;
    if (epsg.y > maxY) maxY = epsg.y;
  }
  return { minX, minY, maxX, maxY };
}

export function polygonCentroid(vertices: Point2D[]): Point2D {
  let cx = 0, cy = 0;
  for (const v of vertices) { cx += v.x; cy += v.y; }
  return { x: cx / vertices.length, y: cy / vertices.length };
}

export interface TerrainAnalysisResult {
  buildingId: string;
  estimatedHeight: number;
  /** Bezwzględna rzędna terenu (n.p.m.) pod budynkiem, z DTM. */
  terrainElevation: number;
  surfaceElevation: number;
  /**
   * Rzędna terenu względem punktu odniesienia (środek projektu) — 0 m w punkcie odniesienia.
   * Obecna tylko gdy podano `referencePoint`; to jest to, co powinno trafić do `BuildingLoop.elevation`
   * (posadowienie), żeby budynki na pochyłym terenie nie stały wszystkie na jednej płaskiej płaszczyźnie.
   */
  relativeElevation?: number;
}

/**
 * Oblicza rzeczywistą wysokość budynków na podstawie różnicy NMPT (DSM) - NMT (DTM)
 * z chmury punktów LiDAR GUGiK. Jeśli podano `referencePoint` (zwykle środek projektu), zwraca też
 * rzędną terenu każdego budynku względem tego punktu (do posadowienia), próbkowaną z tej samej siatki DTM.
 */
export async function analyzeBuildingHeights(
  buildings: BuildingLoop[],
  crsInfo: CrsDetectionResult,
  signal?: AbortSignal,
  referencePoint?: LatLon
): Promise<TerrainAnalysisResult[]> {
  if (buildings.length === 0) return [];

  let globalMinX = Infinity, globalMinY = Infinity;
  let globalMaxX = -Infinity, globalMaxY = -Infinity;
  for (const b of buildings) {
    const bb = computeBuildingBbox(b, crsInfo);
    globalMinX = Math.min(globalMinX, bb.minX);
    globalMinY = Math.min(globalMinY, bb.minY);
    globalMaxX = Math.max(globalMaxX, bb.maxX);
    globalMaxY = Math.max(globalMaxY, bb.maxY);
  }

  const referenceEpsg = referencePoint ? wgs84ToEpsg2180(referencePoint.lat, referencePoint.lon) : null;
  if (referenceEpsg) {
    globalMinX = Math.min(globalMinX, referenceEpsg.x);
    globalMinY = Math.min(globalMinY, referenceEpsg.y);
    globalMaxX = Math.max(globalMaxX, referenceEpsg.x);
    globalMaxY = Math.max(globalMaxY, referenceEpsg.y);
  }

  const margin = 50;
  const minX = globalMinX - margin;
  const minY = globalMinY - margin;
  const maxX = globalMaxX + margin;
  const maxY = globalMaxY + margin;

  // Pobieramy NMPT (DSM) oraz NMT (DTM)
  const [dsm, dtm] = await Promise.all([
    fetchDsmBbox(minX, minY, maxX, maxY, 'DSM_PL-KRON86-NH', signal),
    fetchDtmBbox(minX, minY, maxX, maxY, 'DTM_PL-KRON86-NH', signal).catch(() => null),
  ]);

  const referenceGroundElev = referenceEpsg && dtm ? sampleGrid(dtm, referenceEpsg.x, referenceEpsg.y) : NaN;

  const results: TerrainAnalysisResult[] = [];

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    const centroid = polygonCentroid(building.vertices);
    const wgs = cadPointToWgs84(centroid, crsInfo);
    const epsg = wgs84ToEpsg2180(wgs.lat, wgs.lon);

    const surfaceElev = sampleGrid(dsm, epsg.x, epsg.y);
    if (isNaN(surfaceElev)) continue;

    // Rzędna terenu: z DTM lub fallback do rzędnej budynku
    let groundElev = dtm ? sampleGrid(dtm, epsg.x, epsg.y) : NaN;
    if (isNaN(groundElev)) {
      groundElev = building.elevation ?? 0;
    }

    // Obliczenie wysokości względnej (wysokości obiektu nad gruntem)
    const rawDiff = surfaceElev - groundElev;
    const estimatedHeight = Math.max(2.5, Math.round(rawDiff * 10) / 10);

    results.push({
      buildingId: building.id,
      estimatedHeight,
      terrainElevation: Math.round(groundElev * 10) / 10,
      surfaceElevation: Math.round(surfaceElev * 10) / 10,
      relativeElevation: !isNaN(referenceGroundElev) ? Math.round((groundElev - referenceGroundElev) * 10) / 10 : undefined,
    });
  }

  return results;
}
