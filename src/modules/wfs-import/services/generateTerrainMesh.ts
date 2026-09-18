/**
 * Generuje 3D mesh z NMT GUGiK i zapisuje w store.
 * Może być wywołana z dowolnego miejsca w aplikacji (np. onClick handler).
 */

import { TerrainEngine } from '../../../engine/terrain/TerrainEngine';
import { fetchDtmBbox, type AaigridData } from './wcsGugikClient';
import { useWfsStore, type TerrainMeshData } from '../store/useWfsStore';

export interface MeshGenerationParams {
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
}

export async function generateTerrainMesh(params?: MeshGenerationParams): Promise<TerrainMeshData> {
  const lat = params?.latitude ?? 52.237;
  const lon = params?.longitude ?? 21.0122;
  const radius = params?.radiusMeters ?? 200;

  // Convert to approximate CAD bounding box
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(lat * Math.PI / 180);

  const minX = lon * metersPerDegLon - radius;
  const minY = lat * metersPerDegLat - radius;
  const maxX = lon * metersPerDegLon + radius;
  const maxY = lat * metersPerDegLat + radius;

  // Fetch NMT DTM grid from GUGiK WCS
  const dtm: AaigridData = await fetchDtmBbox(minX, minY, maxX, maxY);

  // Convert Float32Array → Float64Array for TerrainEngine compatibility
  const dataFloat64 = new Float64Array(dtm.data.length);
  for (let i = 0; i < dtm.data.length; i++) {
    dataFloat64[i] = dtm.data[i];
  }

  // Build TerrainEngine
  const engine = TerrainEngine.fromGrid(
    dataFloat64,
    dtm.ncols,
    dtm.nrows,
    minX,
    minY,
    dtm.cellsize,
    dtm.nodata
  );

  // Generate adaptive mesh
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
