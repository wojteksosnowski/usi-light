import { BuildingLoop, Point2D } from '../../../types/geometry';
import { cadPointToWgs84, CrsDetectionResult } from '../../../utils/geoTransform';
import { wgs84ToEpsg2180 } from './wgs84ToEpsg2180';
import { AaigridData, fetchDsmBbox } from '../services/wcsGugikClient';

function sampleGrid(grid: AaigridData, x: number, y: number): number {
  const col = Math.round((x - grid.xllcorner) / grid.cellsize);
  const row = Math.round((y - grid.yllcorner) / grid.cellsize);
  if (col < 0 || col >= grid.ncols || row < 0 || row >= grid.nrows) return grid.nodata;
  const val = grid.data[row * grid.ncols + col];
  return val === grid.nodata ? NaN : val;
}

function computeBuildingBbox(
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

function polygonCentroid(vertices: Point2D[]): Point2D {
  let cx = 0, cy = 0;
  for (const v of vertices) { cx += v.x; cy += v.y; }
  return { x: cx / vertices.length, y: cy / vertices.length };
}

export interface TerrainAnalysisResult {
  buildingId: string;
  estimatedHeight: number;
  terrainElevation: number;
  surfaceElevation: number;
}

export async function analyzeBuildingHeights(
  buildings: BuildingLoop[],
  crsInfo: CrsDetectionResult
): Promise<TerrainAnalysisResult[]> {
  if (buildings.length === 0) return [];

  let globalMinX = Infinity, globalMinY = Infinity;
  let globalMaxX = -Infinity, globalMaxY = -Infinity;
  const bboxes = buildings.map((b) => {
    const bb = computeBuildingBbox(b, crsInfo);
    globalMinX = Math.min(globalMinX, bb.minX);
    globalMinY = Math.min(globalMinY, bb.minY);
    globalMaxX = Math.max(globalMaxX, bb.maxX);
    globalMaxY = Math.max(globalMaxY, bb.maxY);
    return bb;
  });

  const margin = 50;
  const dsm = await fetchDsmBbox(
    globalMinX - margin, globalMinY - margin,
    globalMaxX + margin, globalMaxY + margin
  );

  const results: TerrainAnalysisResult[] = [];

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    const centroid = polygonCentroid(building.vertices);
    const wgs = cadPointToWgs84(centroid, crsInfo);
    const epsg = wgs84ToEpsg2180(wgs.lat, wgs.lon);

    const surfaceElev = sampleGrid(dsm, epsg.x, epsg.y);
    if (isNaN(surfaceElev)) continue;

    const estimatedHeight = Math.max(0, surfaceElev - (building.elevation ?? 0));

    results.push({
      buildingId: building.id,
      estimatedHeight: Math.round(estimatedHeight * 10) / 10,
      terrainElevation: building.elevation ?? 0,
      surfaceElevation: surfaceElev,
    });
  }

  return results;
}
