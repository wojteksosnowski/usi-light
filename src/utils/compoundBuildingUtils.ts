import polygonClipping from 'polygon-clipping';
import { BuildingLoop, FacadeSegment, Point2D } from '../types/geometry';
import { StoryFootprint } from '../types/modifiers';
import { isPolygonCCW } from './math2d/polygons';
import { calculateOutwardNormal } from './math2d/vec2';
import { computeLineEquation } from './segmentStatistics';

export interface CompoundGeometryResult {
  vertices: Point2D[];
  segments: FacadeSegment[];
  storyPolygons?: StoryFootprint[];
  defaultHeight: number;
  elevation: number;
}

/**
 * Przelicza geometrię, rzędne i fasady obiektu złożonego (Compound)
 * na podstawie jego obiektów składowych (children) oraz opcjonalnych modyfikatorów na poziomie kontenera.
 */
export function computeCompoundGeometry(
  compoundId: string,
  children: BuildingLoop[]
): CompoundGeometryResult {
  if (!children || children.length === 0) {
    return {
      vertices: [],
      segments: [],
      defaultHeight: 15.0,
      elevation: 0.0,
    };
  }

  if (children.length === 1) {
    const c = children[0];
    return {
      vertices: c.vertices.map((v) => ({ ...v })),
      segments: c.segments.map((s) => ({ ...s })),
      storyPolygons: c.storyPolygons,
      defaultHeight: c.defaultHeight,
      elevation: c.elevation ?? 0.0,
    };
  }

  // Obliczenie zakresu wysokości
  const minElevation = Math.min(...children.map((c) => c.elevation ?? 0.0));
  const maxTopElevation = Math.max(...children.map((c) => (c.elevation ?? 0.0) + (c.defaultHeight || 15.0)));
  const compoundHeight = Math.max(1.0, maxTopElevation - minElevation);

  // Sprawdzamy, czy wszystkie dzieci mają tę samą rzędną i wysokość do próby wykonania sumy boolowskiej
  const isSameElevation = children.every(
    (c) => Math.abs((c.elevation ?? 0.0) - minElevation) < 0.01
  );
  const firstH = children[0].defaultHeight || 15.0;
  const isSameHeight = children.every(
    (c) => Math.abs((c.defaultHeight || 15.0) - firstH) < 0.01
  );

  let unionVertices: Point2D[] | null = null;

  if (isSameElevation && isSameHeight) {
    try {
      const polys: [number, number][][][] = children
        .filter((c) => c.vertices && c.vertices.length >= 3)
        .map((c) => {
          const ring: [number, number][] = c.vertices.map((v) => [v.x, v.y]);
          if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
            ring.push([ring[0][0], ring[0][1]]);
          }
          return [ring];
        });

      if (polys.length >= 2) {
        let currentUnion: any = polys[0];
        for (let i = 1; i < polys.length; i++) {
          currentUnion = polygonClipping.union(currentUnion, polys[i]);
        }

        if (currentUnion && currentUnion.length === 1 && currentUnion[0].length >= 1) {
          const outerRing = currentUnion[0][0];
          if (outerRing && outerRing.length >= 4) {
            const isClosed =
              outerRing[0][0] === outerRing[outerRing.length - 1][0] &&
              outerRing[0][1] === outerRing[outerRing.length - 1][1];
            const rawPts = isClosed ? outerRing.slice(0, -1) : outerRing;
            const pts: Point2D[] = rawPts.map(([x, y]: [number, number]) => ({ x, y }));
            const ccw = isPolygonCCW(pts);
            unionVertices = ccw ? pts : [...pts].reverse();
          }
        }
      }
    } catch {
      unionVertices = null;
    }
  }

  if (unionVertices && unionVertices.length >= 3) {
    // Utwórz fasady z sumy wielokątów
    const isCCW = isPolygonCCW(unionVertices);
    const n = unionVertices.length;
    const segments: FacadeSegment[] = [];

    for (let i = 0; i < n; i++) {
      const p1 = unionVertices[i];
      const p2 = unionVertices[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      const normal = calculateOutwardNormal(p1, p2, isCCW);
      segments.push({
        id: `${compoundId}-seg-${i + 1}`,
        p1,
        p2,
        normal,
        length: len,
        angleRad: Math.atan2(dy, dx),
        hTop: maxTopElevation,
        hBase: minElevation,
        hWindowBottom: children[0].hWindowBottom ?? 0.85,
        isCityCentre: children.some((c) => c.isCityCentre),
        buildingType: children[0].buildingType || 'residential',
        lineEquation: computeLineEquation(p1, p2, normal),
      });
    }

    return {
      vertices: unionVertices,
      segments,
      defaultHeight: compoundHeight,
      elevation: minElevation,
    };
  }

  // W przeciwnym razie agregujemy fasady wszystkich dzieci i łączymy wierzchołki
  const allSegments: FacadeSegment[] = [];
  children.forEach((c, cIdx) => {
    const cSegments = c.segments || [];
    cSegments.forEach((s, sIdx) => {
      allSegments.push({
        ...s,
        id: `${compoundId}_c${cIdx + 1}_s${sIdx + 1}`,
        hTop: (c.elevation ?? 0.0) + (c.defaultHeight || 15.0),
        hBase: c.elevation ?? 0.0,
      });
    });
  });

  const baseVertices = children[0]?.vertices ? children[0].vertices.map((v) => ({ ...v })) : [];

  return {
    vertices: baseVertices,
    segments: allSegments,
    defaultHeight: compoundHeight,
    elevation: minElevation,
  };
}
