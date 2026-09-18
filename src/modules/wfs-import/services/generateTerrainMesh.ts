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

  // Debug logging
  console.log('[generateTerrainMesh] Input:', { lat, lon, radius });

  // Transform WGS84 lat/lon → EPSG:2180 (Gauss-Kruger)
  const epsgCenter = wgs84ToCadPoint({ lat, lon }, EPSG_2180);
  console.log('[generateTerrainMesh] EPSG:2180 center:', epsgCenter);

  // Create bounding box in EPSG:2180 meters around project center
  const minX = epsgCenter.x - radius;
  const minY = epsgCenter.y - radius;
  const maxX = epsgCenter.x + radius;
  const maxY = epsgCenter.y + radius;
  console.log('[generateTerrainMesh] Bbox:', { minX, minY, maxX, maxY });

  // Fetch NMT DTM grid from GUGiK WCS (uses EPSG:2180 subsetting)
  const dtm: AaigridData = await fetchDtmBbox(minX, minY, maxX, maxY);

  console.log('[generateTerrainMesh] DTM result:', {
    ncols: dtm.ncols,
    nrows: dtm.nrows,
    cellsize: dtm.cellsize,
    xllcorner: dtm.xllcorner,
    yllcorner: dtm.yllcorner,
    nodata: dtm.nodata,
    dataLength: dtm.data.length,
    first5DataPoints: Array.from(dtm.data).slice(0, 5),
  });

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

  // Extract mesh info
  const trianglesArr = engine.getMeshTriangles();
  const vertices = engine.getMeshVertices();

  const [minElev, maxElev] = computeElevationRange(dtm.data, dtm.nodata);

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
