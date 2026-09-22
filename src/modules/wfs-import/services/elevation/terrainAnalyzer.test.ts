import { describe, it, expect } from 'vitest';
import { computeBuildingBbox, analyzeBuildingHeights } from './terrainAnalyzer';
import type { BuildingLoop } from '../../../../types/geometry';
import type { CrsDetectionResult } from '../../../../utils/geoTransform';

// Lokalny CRS ze środkiem projektu w (0,0) lokalnych metrów — `cadPointToWgs84`/
// `wgs84ToCadPoint` bez podanego `projectCenterLatLon` domyślnie centruje na Warszawie
// (52.2297°N, 21.0122°E), więc punkt referencyjny musi być spójny z tym domyślnym środkiem.
const localCrs: CrsDetectionResult = {
  crs: 'LOCAL',
  description: 'lokalny (test)',
  geodeticLabel: 'lokalny',
  isGeodetic: false,
  isLocalReference: true,
};
const projectReferencePoint = { lat: 52.2297, lon: 21.0122 };

function makeSquareBuilding(id: string, cx: number, cy: number, halfSize: number): BuildingLoop {
  return {
    id,
    vertices: [
      { x: cx - halfSize, y: cy - halfSize },
      { x: cx + halfSize, y: cy - halfSize },
      { x: cx + halfSize, y: cy + halfSize },
      { x: cx - halfSize, y: cy + halfSize },
    ],
    segments: [],
    isTested: false,
    isIncluded: true,
    isLocked: false,
    isGhosted: false,
    category: 'building',
  } as unknown as BuildingLoop;
}

describe('computeBuildingBbox', () => {
  it('zwraca obwiednię zgodną z wierzchołkami budynku', () => {
    const building = makeSquareBuilding('b1', 0, 0, 10);
    const bbox = computeBuildingBbox(building, localCrs);
    expect(bbox.maxX - bbox.minX).toBeGreaterThan(15);
    expect(bbox.maxX - bbox.minX).toBeLessThan(25);
    expect(bbox.maxY - bbox.minY).toBeGreaterThan(15);
    expect(bbox.maxY - bbox.minY).toBeLessThan(25);
  });
});

describe('analyzeBuildingHeights — odrzucanie odstających budynków (regresja WCS 400)', () => {
  it('nie rozdyma globalnej obwiedni budynkiem odstającym o setki km (np. błędnie otagowana relacja OSM)', async () => {
    // Kilka normalnych, małych budynków w promieniu ~100 m od centrum projektu, plus jeden
    // "odstający" budynek 275 km dalej — dokładnie ten scenariusz, który wcześniej powodował
    // wysłanie do WCS GUGiK zapytania o obwiednię całej Polski i odpowiedź 400.
    const buildings = [
      makeSquareBuilding('osm-1', 0, 0, 10),
      makeSquareBuilding('osm-2', 50, 30, 8),
      makeSquareBuilding('osm-outlier', 275_000, 125_000, 15),
    ];

    let capturedBbox: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
    const originalFetch = global.fetch;
    global.fetch = (async (url: string) => {
      const parsed = new URL(url, 'http://localhost');
      const subsets = parsed.searchParams.getAll('subset');
      const xSubset = subsets.find((s) => s.startsWith('x('));
      const ySubset = subsets.find((s) => s.startsWith('y('));
      if (xSubset && ySubset) {
        const [minX, maxX] = xSubset.slice(2, -1).split(',').map(Number);
        const [minY, maxY] = ySubset.slice(2, -1).split(',').map(Number);
        capturedBbox = { minX, minY, maxX, maxY };
      }
      const grid = 'ncols 1\nnrows 1\nxllcorner 0\nyllcorner 0\ncellsize 1\nNODATA_value -9999\n100';
      return new Response(grid, { status: 200 });
    }) as typeof fetch;

    try {
      await analyzeBuildingHeights(buildings, localCrs, undefined, projectReferencePoint);
    } finally {
      global.fetch = originalFetch;
    }

    expect(capturedBbox).not.toBeNull();
    const span = Math.max(
      capturedBbox!.maxX - capturedBbox!.minX,
      capturedBbox!.maxY - capturedBbox!.minY
    );
    // Obwiednia musi zostać lokalna (rzędu dziesiątek/setek metrów), nie setek kilometrów.
    expect(span).toBeLessThan(1000);
  });
});
