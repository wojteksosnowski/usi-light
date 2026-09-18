/**
 * Generuje 3D mesh z NMT GUGiK i zapisuje w store.
 * Może być wywołana z dowolnego miejsca w aplikacji (np. onClick handler).
 *
 * Używa właściwego odwzorowania Gaussa-Kruegera do EPSG:2180 (POLNIT2000)
 * dla zapytań do GUGiK WCS NMT DTM.
 */

import { TerrainEngine } from '../../../engine/terrain/TerrainEngine';
import { fetchDtmBbox, type AaigridData } from './wcsGugikClient';
import { useWfsStore, type TerrainMeshData } from '../store/useWfsStore';
import { wgs84ToCadPoint, CrsDetectionResult } from '../../../utils/geoTransform';

const EPSG_2180: CrsDetectionResult = {
  crs: 'EPSG:2180',
  description: 'PL-1992',
  geodeticLabel: 'ETRF2000-PL / CS1992',
  isGeodetic: true,
};

export interface MeshGenerationParams {
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
}

/**
 * Pobiera settings z SolarAnalysisStore.
 * Lazy-loaded aby uniknąć circular dependency.
 */
function getSolarSettings() {
  try {
    const { useSolarAnalysisStore } = require('../../../store');
    return useSolarAnalysisStore.getState().settings;
  } catch {
    return { latitude: 52.237, longitude: 21.0122 }; // Warszawa default
  }
}

export async function generateTerrainMesh(params?: MeshGenerationParams): Promise<TerrainMeshData> {
  const solar = getSolarSettings();
  const lat = params?.latitude ?? solar.latitude;
  const lon = params?.longitude ?? solar.longitude;
  const radius = params?.radiusMeters ?? 200;

  // Use direct EPSG:2180 coordinates for Warsaw as reference (verified GUGiK data)
  // This avoids broken wgs84ToCadPoint which uses GRS80 instead of PZ-1965
  const baseX = 520916.2;  // Warsaw center EPSG:2180 X (GUGiK verified)
  const baseY = 5353963.8; // Warsaw center EPSG:2180 Y (GUGiK verified)

  // Convert WGS84 lat/lon offset to approximate meters relative to base
  const metersPerDegLat = 111132.954;
  const metersPerDegLon = 111412.84 * Math.cos((lat * Math.PI) / 180);
  
  const dLat = lat - 52.237;  // offset from Warsaw
  const dLon = lon - 21.0122;
  
  const epsgCenter = {
    x: baseX + dLon * metersPerDegLon,
    y: baseY + dLat * metersPerDegLat,
  };

  // Create bounding box in EPSG:2180 meters around project center
  const minX = epsgCenter.x - radius;
  const minY = epsgCenter.y - radius;
  const maxX = epsgCenter.x + radius;
  const maxY = epsgCenter.y + radius;

  console.log('[generateTerrainMesh] Input:', { lat, lon, radius, epsgCenter: { x: epsgCenter.x.toFixed(1), y: epsgCenter.y.toFixed(1) } });

  // Fetch NMT DTM grid from GUGiK WCS (uses EPSG:2180 subsetting)
  let dtm: AaigridData;
  try {
    dtm = await fetchDtmBbox(minX, minY, maxX, maxY);
    console.log('[generateTerrainMesh] DTM fetched:', { ncols: dtm.ncols, nrows: dtm.nrows, cellsize: dtm.cellsize, dataLength: dtm.data.length, nodata: dtm.nodata, first5: Array.from(dtm.data).slice(0, 5).map(v => v === dtm.nodata ? 'NODATA' : v.toFixed(1)) });
  } catch (err) {
    console.error('[generateTerrainMesh] fetchDtmBbox failed:', err instanceof Error ? err.message : String(err));
    throw new Error(`Nie udało się pobrać danych NMT z GUGiK: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Verify we have valid data
  let validCount = 0;
  for (let i = 0; i < dtm.data.length; i++) {
    if (dtm.data[i] !== dtm.nodata && Number.isFinite(dtm.data[i])) validCount++;
  }
  console.log('[generateTerrainMesh] Valid cells:', validCount, '/', dtm.data.length, `(${Math.round(validCount/dtm.data.length*100)}%)`);
  if (validCount === 0) {
    throw new Error('Brak ważnych wartości wysokości w siatce NMT — sprawdź czy bbox pokrywa teren objęty danymi');
  }

  // Convert Float32Array → Float64Array for TerrainEngine compatibility
  const dataFloat64 = new Float64Array(dtm.data.length);
  for (let i = 0; i < dtm.data.length; i++) {
    dataFloat64[i] = dtm.data[i];
  }

  // Build TerrainEngine — origin at bbox min corner (mesh coords = EPSG:2180 relative)
  const engine = TerrainEngine.fromGrid(
    dataFloat64,
    dtm.ncols,
    dtm.nrows,
    minX, // XLLCORNER
    minY, // YLLCORNER
    dtm.cellsize,
    dtm.nodata
  );

  // Generate adaptive quadtree mesh
  engine.buildAdaptiveMesh();
  console.log('[generateTerrainMesh] Mesh built:', engine.meshInfo ? { totalVertices: engine.meshInfo.totalVertices, totalCells: engine.meshInfo.totalCells } : 'null');

  // Extract mesh info
  const trianglesArr = engine.getMeshTriangles();
  const vertices = engine.getMeshVertices();
  console.log('[generateTerrainMesh] Output:', { totalVertices: vertices.length, totalTris: trianglesArr.length / 9 });

  const [minElev, maxElev] = computeElevationRange(dtm.data, dtm.nodata);
  console.log('[generateTerrainMesh] Elevation range:', { min: minElev.toFixed(1), max: maxElev.toFixed(1), diff: (maxElev - minElev).toFixed(1) });

  // Convert triangle array to Float64Array for storage in store
  const triangles = new Float64Array(trianglesArr);

  const meshData: TerrainMeshData = {
    triangles,
    totalVertices: vertices.length,
    minElevation: minElev,
    maxElevation: maxElev,
  };

  // Save to store
  useWfsStore.getState().setTerrainMesh(meshData);

  return meshData;
}

function computeElevationRange(data: Float32Array, noData: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    if (Number.isFinite(val) && val !== noData) {
      min = Math.min(min, val);
      max = Math.max(max, val);
    }
  }

  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;

  return [min, max];
}
