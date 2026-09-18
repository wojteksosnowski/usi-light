/**
 * Generuje 3D mesh z NMT GUGiK i zapisuje w store.
 * Może być wywołana z dowolnego miejsca w aplikacji (np. onClick handler).
 *
 * Używa precyzyjnego odwzorowania Gaussa-Kruegera:
 * 1. Do zapytań do GUGiK WCS NMT DTM: EPSG:2180 (PL-1992, L0=19°)
 * 2. Do pozycjonowania siatki w układzie współrzędnych sceny CAD:
 *    PL-2000 (EPSG:2176..2179 wg stref 5-8) lub LOCAL CAD z uwzględnieniem zbieżności południków.
 */

import { TerrainEngine } from '../../../engine/terrain/TerrainEngine';
import { fetchDtmBbox, type AaigridData } from './wcsGugikClient';
import { useWfsStore, type TerrainMeshData } from '../store/useWfsStore';
import { useSceneStore } from '../../../store/useSceneStore';
import { useSolarAnalysisStore } from '../../../store/useSolarAnalysisStore';
import { wgs84ToCadPoint, cadPointToWgs84, detectCoordinateSystem, CrsDetectionResult } from '../../../utils/geoTransform';
import type { Point2D } from '../../../types/geometry';

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

export async function generateTerrainMesh(params?: MeshGenerationParams): Promise<TerrainMeshData> {
  const solar = useSolarAnalysisStore.getState().settings;
  const wfsRadius = useWfsStore.getState().projectRadius;
  const lat = params?.latitude ?? solar.latitude;
  const lon = params?.longitude ?? solar.longitude;
  const radius = params?.radiusMeters ?? wfsRadius ?? 200;

  // 1. Oblicz środek w układzie PL-1992 (EPSG:2180) dla zapytania do serwera GUGiK WCS
  const centerPl1992 = wgs84ToCadPoint({ lat, lon }, EPSG_2180);

  const minX = centerPl1992.x - radius;
  const minY = centerPl1992.y - radius;
  const maxX = centerPl1992.x + radius;
  const maxY = centerPl1992.y + radius;

  console.log('[generateTerrainMesh] Input:', {
    lat,
    lon,
    radius,
    wcsBbox2180: { minX: minX.toFixed(1), minY: minY.toFixed(1), maxX: maxX.toFixed(1), maxY: maxY.toFixed(1) },
  });

  // 2. Sprawdź czy mamy już dane w buforze pamięci (pre-warmed / pre-fetched)
  let dtm: AaigridData | null = useWfsStore.getState().terrainDtmCache;

  if (!dtm) {
    console.log('[generateTerrainMesh] Brak w buforze — pobieranie siatki NMT DTM z serwera GUGiK WCS...');
    try {
      dtm = await fetchDtmBbox(minX, minY, maxX, maxY);
      useWfsStore.getState().setTerrainDtmCache(dtm);
      console.log('[generateTerrainMesh] DTM pobrano i zapisano w buforze:', {
        ncols: dtm.ncols,
        nrows: dtm.nrows,
        cellsize: dtm.cellsize,
        dataLength: dtm.data.length,
      });
    } catch (err) {
      console.error('[generateTerrainMesh] fetchDtmBbox failed:', err instanceof Error ? err.message : String(err));
      throw new Error(`Nie udało się pobrać danych NMT z GUGiK: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    console.log('[generateTerrainMesh] Użyto gotowego bufora NMT DTM (0ms network) ⚡');
  }

  // 3. Sprawdź czy pobrano ważne wartości wysokości
  let validCount = 0;
  for (let i = 0; i < dtm.data.length; i++) {
    if (dtm.data[i] !== dtm.nodata && Number.isFinite(dtm.data[i])) validCount++;
  }
  console.log('[generateTerrainMesh] Valid cells:', validCount, '/', dtm.data.length, `(${Math.round((validCount / dtm.data.length) * 100)}%)`);
  if (validCount === 0) {
    throw new Error('Brak ważnych wartości wysokości w siatce NMT — sprawdź czy bbox pokrywa teren objęty danymi');
  }

  // 4. Określ układ współrzędnych sceny CAD (PL-2000 pas 5-8: EPSG:2176..2179 lub LOCAL CAD)
  const sceneBuildings = useSceneStore.getState().buildings || [];
  const allScenePoints: Point2D[] = sceneBuildings.flatMap((b) => b.storyPolygons?.[0]?.polygon || b.vertices || []);
  const detectedCrs = detectCoordinateSystem(allScenePoints, { lat, lon });

  // 5. Konwersja i odwrócenie wierszy AAIGRID do standardowego układu kartezjańskiego (row 0 = Południe/Ymin, row nrows-1 = Północ/Ymax)
  const dataFloat64 = new Float64Array(dtm.data.length);
  for (let r = 0; r < dtm.nrows; r++) {
    const srcRow = dtm.nrows - 1 - r;
    const srcOffset = srcRow * dtm.ncols;
    const dstOffset = r * dtm.ncols;
    for (let c = 0; c < dtm.ncols; c++) {
      dataFloat64[dstOffset + c] = dtm.data[srcOffset + c];
    }
  }

  // 6. Precyzyjne wyznaczenie wektorów bazowych siatki w układzie CAD (EPSG:2180 -> WGS84 -> CAD)
  const wfsCoordToCad = (x2180: number, y2180: number): Point2D => {
    const latLon = cadPointToWgs84({ x: x2180, y: y2180 }, EPSG_2180);
    return wgs84ToCadPoint(latLon, detectedCrs, { lat, lon });
  };

  const xMin2180 = dtm.xllcorner;
  const yMin2180 = dtm.yllcorner;
  const xMax2180 = dtm.xllcorner + (dtm.ncols - 1) * dtm.cellsize;
  const yMax2180 = dtm.yllcorner + (dtm.nrows - 1) * dtm.cellsize;

  const pSW = wfsCoordToCad(xMin2180, yMin2180);
  const pSE = wfsCoordToCad(xMax2180, yMin2180);
  const pNW = wfsCoordToCad(xMin2180, yMax2180);

  const denomCol = Math.max(1, dtm.ncols - 1);
  const denomRow = Math.max(1, dtm.nrows - 1);

  const ux = (pSE.x - pSW.x) / denomCol;
  const uy = (pSE.y - pSW.y) / denomCol;
  const vx = (pNW.x - pSW.x) / denomRow;
  const vy = (pNW.y - pSW.y) / denomRow;

  // 7. Zbuduj silnik TerrainEngine z precyzyjną transformacją afiniczną 2D
  const engine = TerrainEngine.fromGrid(
    dataFloat64,
    dtm.ncols,
    dtm.nrows,
    pSW.x,
    pSW.y,
    dtm.cellsize,
    dtm.nodata,
    undefined,
    { ux, uy, vx, vy }
  );

  // 8. Wygeneruj rzadką, organiczną i czytelną siatkę TIN (Contour-Driven Delaunay)
  engine.buildAdaptiveMesh({
    heightSplitThreshold: 2.5,
    minCellSizeMeters: 16.0,
  });
  console.log('[generateTerrainMesh] Mesh built:', engine.meshInfo ? { totalVertices: engine.meshInfo.totalVertices, totalCells: engine.meshInfo.totalCells } : 'null');

  const trianglesArr = engine.getMeshTriangles();
  const vertices = engine.getMeshVertices();
  const wireframeEdges = engine.getWireframeEdges();
  console.log('[generateTerrainMesh] Output:', {
    totalVertices: vertices.length,
    totalTris: trianglesArr.length / 9,
    wireframeEdges: wireframeEdges.length / 4,
  });

  const [minElev, maxElev] = computeElevationRange(dtm.data, dtm.nodata);
  console.log('[generateTerrainMesh] Elevation range:', { min: minElev.toFixed(1), max: maxElev.toFixed(1), diff: (maxElev - minElev).toFixed(1) });

  const triangles = new Float64Array(trianglesArr);

  // Wygeneruj izolinie / warstwice (Marching Squares) co 1.0 m
  const contours = engine.generateContours({ interval: 1.0 });
  console.log('[generateTerrainMesh] Contours generated:', contours.length, 'elevation levels');

  const meshData: TerrainMeshData = {
    triangles,
    totalVertices: vertices.length,
    minElevation: minElev,
    maxElevation: maxElev,
    contours,
    wireframeEdges,
  };

  // 9. Zapisz wygenerowany mesh w store i automatycznie włącz widok wireframe i warstwic
  useWfsStore.getState().setTerrainMesh(meshData);
  useWfsStore.getState().setShowTerrainMesh(true);
  useWfsStore.getState().setShowTerrainContours(true);
  window.dispatchEvent(new Event('geo-render-needed'));

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
