import { cadPointToWgs84, wgs84ToCadPoint, CrsDetectionResult, LatLon } from '../../../utils/geoTransform';
import { fetchDtmBbox } from '../services/wcsGugikClient';
import { EPSG_2180 } from '../services/wfsEgibClient';
import { wgs84ToEpsg2180 } from './wgs84ToEpsg2180';
import { sampleGrid } from './terrainAnalyzer';

/** Docelowa liczba węzłów siatki na bok — trzymamy eksport DXF w rozsądnym rozmiarze. */
const TARGET_GRID_DIM = 100;

/** Indeksy 0..max-1 co `step`, zawsze z ostatnim indeksem (max-1) dołączonym na końcu. */
function decimatedIndices(max: number, step: number): number[] {
  const indices: number[] = [];
  for (let i = 0; i < max; i += step) indices.push(i);
  if (indices[indices.length - 1] !== max - 1) indices.push(max - 1);
  return indices;
}

export interface TerrainMeshResult {
  /** Linie DXF (POLYLINE Polygon Mesh + VERTEX*M*N + SEQEND), gotowe do wklejenia w sekcję ENTITIES. */
  entityLines: string[];
  warning: string | null;
}

/**
 * Buduje siatkę terenu (Polygon Mesh, DXF grupa 70 = 16) z realnych danych NMT (GUGiK WCS),
 * na warstwie `RZEZBA_TERENU`, we współrzędnych lokalnych CAD projektu. Rzędne są liczone
 * względem wysokości terenu w środku projektu (0 m = poziom środka projektu).
 */
export async function buildTerrainMeshDxfEntities(
  projectCenter: LatLon,
  radiusMeters: number,
  projectCrs: CrsDetectionResult
): Promise<TerrainMeshResult> {
  const center2180 = wgs84ToEpsg2180(projectCenter.lat, projectCenter.lon);
  const margin = Math.max(20, radiusMeters * 0.1);
  const minX = center2180.x - radiusMeters - margin;
  const maxX = center2180.x + radiusMeters + margin;
  const minY = center2180.y - radiusMeters - margin;
  const maxY = center2180.y + radiusMeters + margin;

  let dtm;
  try {
    dtm = await fetchDtmBbox(minX, minY, maxX, maxY);
  } catch (err) {
    return { entityLines: [], warning: `Nie udało się pobrać NMT (GUGiK WCS): ${err instanceof Error ? err.message : 'nieznany błąd'}` };
  }

  if (dtm.ncols < 2 || dtm.nrows < 2) {
    return { entityLines: [], warning: 'Brak pokrycia NMT dla tego obszaru — pominięto rzeźbę terenu.' };
  }

  const referenceElevation = sampleGrid(dtm, center2180.x, center2180.y);
  const refZ = Number.isFinite(referenceElevation) ? referenceElevation : 0;

  const stepX = Math.max(1, Math.floor(dtm.ncols / TARGET_GRID_DIM));
  const stepY = Math.max(1, Math.floor(dtm.nrows / TARGET_GRID_DIM));

  const cols = decimatedIndices(dtm.ncols, stepX);
  const rows = decimatedIndices(dtm.nrows, stepY);

  const M = rows.length;
  const N = cols.length;
  if (M < 2 || N < 2) {
    return { entityLines: [], warning: 'Zbyt mało punktów NMT w tym obszarze — pominięto rzeźbę terenu.' };
  }

  let lastValidZ = refZ;
  const vertexLines: string[] = [];
  const { xllcorner, yllcorner, cellsize } = dtm;

  for (const r of rows) {
    for (const c of cols) {
      const worldX = xllcorner + c * cellsize;
      const worldY = yllcorner + r * cellsize;
      let elevation = sampleGrid(dtm, worldX, worldY);
      if (!Number.isFinite(elevation)) elevation = lastValidZ;
      else lastValidZ = elevation;

      const wgs = cadPointToWgs84({ x: worldX, y: worldY }, EPSG_2180);
      const cad = wgs84ToCadPoint(wgs, projectCrs, projectCenter);
      const z = elevation - refZ;

      vertexLines.push('0', 'VERTEX');
      vertexLines.push('8', 'RZEZBA_TERENU');
      vertexLines.push('70', '64'); // 3D polygon mesh vertex
      vertexLines.push('10', cad.x.toFixed(3));
      vertexLines.push('20', cad.y.toFixed(3));
      vertexLines.push('30', z.toFixed(3));
    }
  }

  const entityLines: string[] = [
    '0', 'POLYLINE',
    '8', 'RZEZBA_TERENU',
    '66', '1',
    '70', '16', // 3D polygon mesh
    '71', String(M),
    '72', String(N),
    ...vertexLines,
    '0', 'SEQEND',
  ];

  return { entityLines, warning: null };
}
