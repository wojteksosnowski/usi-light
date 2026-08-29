import { Point2D, Vector2D, BuildingLoop } from '../types/geometry';
import { calculateSolarPosition } from './solar';
import polygonClipping from 'polygon-clipping';

/**
 * Calculates the signed area of a 2D polygon using the Shoelace formula / Green's theorem.
 * Positive => Counter-Clockwise (CCW)
 * Negative => Clockwise (CW)
 */
export function calculateSignedArea(points: Point2D[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

export function isPolygonCCW(points: Point2D[]): boolean {
  return calculateSignedArea(points) > 0;
}

/**
 * Calculates the outward unit normal vector for segment P1->P2.
 * For a CCW polygon, the outward normal is ( (y2-y1)/L, -(x2-x1)/L ).
 * For a CW polygon, we flip the normal to keep it pointing outward.
 */
export function calculateOutwardNormal(
  p1: Point2D,
  p2: Point2D,
  polygonIsCCW: boolean = true
): Vector2D {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return { x: 0, y: 1 };
  }

  // Base normal for CCW: (dy / L, -dx / L)
  let nx = dy / length;
  let ny = -dx / length;

  if (!polygonIsCCW) {
    nx = -nx;
    ny = -ny;
  }

  return { x: nx, y: ny };
}

/**
 * Checks if a point is inside a polygon using ray casting algorithm.
 */
export function isPointInPolygon(point: Point2D, vertices: Point2D[]): boolean {
  let inside = false;
  const { x, y } = point;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x,
      yi = vertices[i].y;
    const xj = vertices[j].x,
      yj = vertices[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-10) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Ray-segment intersection in 2D.
 * Ray: R(t) = origin + t * dir, t >= 0
 * Segment: S(u) = p1 + u * (p2 - p1), u in [0, 1]
 */
export function raySegmentIntersection(
  origin: Point2D,
  dir: Vector2D,
  p1: Point2D,
  p2: Point2D
): { hit: boolean; distance: number; point?: Point2D } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const cross = dir.x * dy - dir.y * dx;
  if (Math.abs(cross) < 1e-9) {
    return { hit: false, distance: Infinity }; // Parallel
  }

  const ox = p1.x - origin.x;
  const oy = p1.y - origin.y;

  const t = (ox * dy - oy * dx) / cross;
  const u = (ox * dir.y - oy * dir.x) / cross;

  if (t >= 1e-5 && u >= 0 && u <= 1) {
    return {
      hit: true,
      distance: t,
      point: {
        x: origin.x + t * dir.x,
        y: origin.y + t * dir.y,
      },
    };
  }

  return { hit: false, distance: Infinity };
}

/**
 * Distance from point P to line segment AB.
 */
export function distancePointToSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D
): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

/**
 * Generates sampled test points along a segment with a given interval in meters.
 */
export function sampleSegmentPoints(
  p1: Point2D,
  p2: Point2D,
  interval: number = 0.5
): { point: Point2D; ratio: number }[] {
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (len === 0) return [{ point: p1, ratio: 0.5 }];

  const count = Math.max(1, Math.round(len / interval));
  const points: { point: Point2D; ratio: number }[] = [];

  // Sample interior points along the segment (avoiding degenerate 0.0 and 1.0 exact corner vertices)
  for (let i = 0; i < count; i++) {
    const ratio = (i + 0.5) / count;
    points.push({
      point: {
        x: p1.x + ratio * (p2.x - p1.x),
        y: p1.y + ratio * (p2.y - p1.y),
      },
      ratio,
    });
  }

  return points;
}

/**
 * Analityczne przecięcie odcinka AB z kołem o środku w punkcie P i promieniu R.
 * Zwraca część odcinka znajdującą się wewnątrz koła [p1, p2] lub null jeśli odcinek jest w całości na zewnątrz.
 */
export function clipSegmentToCircle(
  center: Point2D,
  radius: number,
  a: Point2D,
  b: Point2D
): { p1: Point2D; p2: Point2D; t1: number; t2: number } | null {

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) {
    const d = Math.hypot(a.x - center.x, a.y - center.y);
    return d <= radius + 1e-4 ? { p1: a, p2: a, t1: 0, t2: 0 } : null;
  }

  const ox = a.x - center.x;
  const oy = a.y - center.y;
  const B = 2 * (ox * dx + oy * dy);
  const C = ox * ox + oy * oy - radius * radius;
  const disc = B * B - 4 * len2 * C;

  const daSq = ox * ox + oy * oy;
  const dbSq = (b.x - center.x) ** 2 + (b.y - center.y) ** 2;
  const rSq = radius * radius;

  let tMin = 0;
  let tMax = 1;

  if (daSq <= rSq + 1e-4 && dbSq <= rSq + 1e-4) {
    // Przypadek 1: Oba wierzchołki wewnątrz okręgu
    tMin = 0;
    tMax = 1;
  } else if (disc >= 0) {
    const sq = Math.sqrt(disc);
    const root1 = (-B - sq) / (2 * len2);
    const root2 = (-B + sq) / (2 * len2);
    const rA = Math.min(root1, root2);
    const rB = Math.max(root1, root2);

    // Część wspólna [0, 1] oraz [rA, rB]
    tMin = Math.max(0, rA);
    tMax = Math.min(1, rB);

    if (tMax < tMin - 1e-6) return null; // Całkowicie poza
  } else {
    // Brak przecięcia
    return null;
  }

  return {
    p1: { x: a.x + tMin * dx, y: a.y + tMin * dy },
    p2: { x: a.x + tMax * dx, y: a.y + tMax * dy },
    t1: tMin,
    t2: tMax,
  };
}

/**
 * Czysto analityczne sprawdzenie czy wektor kierunkowy 'dir' leży w stożku kątowym
 * wyznaczonym przez odcinek C1-C2 względem punktu obserwacji 'origin' (bez raycastingu).
 */
export function isDirectionInSegmentCone(
  origin: Point2D,
  dir: Vector2D,
  c1: Point2D,
  c2: Point2D
): boolean {
  const v1x = c1.x - origin.x;
  const v1y = c1.y - origin.y;
  const v2x = c2.x - origin.x;
  const v2y = c2.y - origin.y;

  // Sprawdzenie zwrotu (kierunek musi być skierowany w stronę odcinka)
  if (dir.x * (v1x + v2x) + dir.y * (v1y + v2y) <= 0) {
    return false;
  }

  const cross12 = v1x * v2y - v1y * v2x;

  if (cross12 > 1e-9) {
    // v1 -> v2 jest CCW
    const c1d = v1x * dir.y - v1y * dir.x;
    const dv2 = dir.x * v2y - dir.y * v2x;
    return c1d >= -1e-7 && dv2 >= -1e-7;
  } else if (cross12 < -1e-9) {
    // v1 -> v2 jest CW
    const c2d = v2x * dir.y - v2y * dir.x;
    const dv1 = dir.x * v1y - dir.y * v1x;
    return c2d >= -1e-7 && dv1 >= -1e-7;
  } else {
    // Punkty c1 i c2 są współliniowe z origin
    const dot1 = dir.x * v1x + dir.y * v1y;
    return dot1 > 0;
  }
}

/**
 * Computes the 2D convex hull of a set of 2D points using Andrew's monotone chain algorithm.
 * Time complexity: O(n log n).
 * Returns vertices in counter-clockwise order.
 */
export function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return [...points];

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  // Lower hull
  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove the last point of each half because it's repeated
  lower.pop();
  upper.pop();

  return lower.concat(upper);
}

/**
 * Wyznacza obwiednię maksymalnego zasięgu cienia (Shadow Envelope) rzucanego przez budynek
 * w oknie czasowym równonocy (§ 56 WT).
 */
export function computeBuildingShadowEnvelope(
  building: BuildingLoop,
  latitude: number = 52.23,
  equinoxDate: 'spring' | 'autumn' = 'spring',
  isChildcare: boolean = false
): Point2D[] {
  const vertices = building.vertices;
  if (!vertices || vertices.length === 0) return [];

  const height = building.defaultHeight;
  const month = equinoxDate === 'autumn' ? 9 : 3;
  const day = equinoxDate === 'autumn' ? 23 : 21;

  const noonPos = calculateSolarPosition(latitude, 21.01, month, day, 12.0);
  const noonHour = noonPos.solarNoonDecimal;
  const hoursRadius = isChildcare ? 4 : 5;

  const startHour = Math.max(6.0, noonHour - hoursRadius);
  const endHour = Math.min(18.0, noonHour + hoursRadius);

  const shadowPoints: Point2D[] = [...vertices];

  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const hour = startHour + (i / steps) * (endHour - startHour);
    const pos = calculateSolarPosition(latitude, 21.01, month, day, hour);
    if (pos.elevationDeg > 0.5) {
      const azRad = pos.azimuthDeg * (Math.PI / 180);
      const tanElev = Math.tan(pos.elevationDeg * (Math.PI / 180));
      const shadowDist = height / tanElev;

      // Sun direction is (sin(az), cos(az)). Shadow points in opposite direction:
      const sDx = -Math.sin(azRad) * shadowDist;
      const sDy = -Math.cos(azRad) * shadowDist;

      for (const v of vertices) {
        shadowPoints.push({
          x: v.x + sDx,
          y: v.y + sDy,
        });
      }
    }
  }

  return computeConvexHull(shadowPoints);
}

/**
 * Wyznacza sumę boolowską (Boolean Union) zakresów cienia wszystkich obiektów badanych.
 * Zwraca tablicę pętli konturów (Point2D[][]), zachowując rozłączne obiekty, wcięcia i otwory.
 */
export function computeCombinedShadowEnvelope(
  buildings: BuildingLoop[],
  latitude: number = 52.23,
  equinoxDate: 'spring' | 'autumn' = 'spring'
): Point2D[][] {
  const testedBuildings = buildings.filter(
    (b) => b.isTested && b.isIncluded !== false && b.vertices && b.vertices.length >= 3
  );
  if (testedBuildings.length === 0) return [];

  const buildingPolys: [number, number][][][] = [];

  for (const bldg of testedBuildings) {
    const isChildcare = bldg.segments.some((s) => s.buildingType === 'childcare');
    const env = computeBuildingShadowEnvelope(bldg, latitude, equinoxDate, isChildcare);
    if (env.length >= 3) {
      const ring: [number, number][] = env.map((p) => [p.x, p.y]);
      // Ensure ring is closed for polygon-clipping
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      buildingPolys.push([ring]);
    }
  }

  if (buildingPolys.length === 0) return [];

  try {
    const unionResult = polygonClipping.union(buildingPolys[0], ...buildingPolys.slice(1));
    const resultLoops: Point2D[][] = [];

    for (const polygon of unionResult) {
      for (const ring of polygon) {
        if (ring.length >= 3) {
          // Remove duplicate closing vertex for Canvas rendering loop
          const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
          const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
          const points: Point2D[] = ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y }));
          resultLoops.push(points);
        }
      }
    }
    return resultLoops;
  } catch (err) {
    console.error('Błąd podczas obliczania sumy boolowskiej cienia:', err);
    return testedBuildings.map((b) => computeBuildingShadowEnvelope(b, latitude, equinoxDate, false));
  }
}

/**
 * Offsets a single polygon edge parallel to itself while preserving adjacent edge directions.
 * @param vertices Cyclic vertices of the polygon
 * @param edgeIndex Index of edge to offset (from vertices[edgeIndex] to vertices[(edgeIndex+1)%n])
 * @param delta Vector displacement { x, y } in world units (meters)
 */
export function offsetPolygonEdge(
  vertices: Point2D[],
  edgeIndex: number,
  delta: Point2D
): Point2D[] {
  const n = vertices.length;
  if (n < 3 || edgeIndex < 0 || edgeIndex >= n) return vertices;

  const isCCW = isPolygonCCW(vertices);
  const v1 = vertices[edgeIndex];
  const v2 = vertices[(edgeIndex + 1) % n];
  const normal = calculateOutwardNormal(v1, v2, isCCW);

  // Normal displacement (projection of mouse delta onto edge normal)
  const d = delta.x * normal.x + delta.y * normal.y;
  if (Math.abs(d) < 1e-6) return vertices;

  // Previous edge V0 -> V1
  const prevIdx = (edgeIndex - 1 + n) % n;
  const v0 = vertices[prevIdx];
  const dPrev = { x: v1.x - v0.x, y: v1.y - v0.y };
  const denomPrev = dPrev.x * normal.x + dPrev.y * normal.y;

  let newV1: Point2D;
  if (Math.abs(denomPrev) > 1e-4) {
    const factor = d / denomPrev;
    newV1 = { x: v1.x + factor * dPrev.x, y: v1.y + factor * dPrev.y };
  } else {
    newV1 = { x: v1.x + d * normal.x, y: v1.y + d * normal.y };
  }

  // Next edge V2 -> V3
  const nextIdx = (edgeIndex + 2) % n;
  const v3 = vertices[nextIdx];
  const dNext = { x: v3.x - v2.x, y: v3.y - v2.y };
  const denomNext = dNext.x * normal.x + dNext.y * normal.y;

  let newV2: Point2D;
  if (Math.abs(denomNext) > 1e-4) {
    const factor = d / denomNext;
    newV2 = { x: v2.x + factor * dNext.x, y: v2.y + factor * dNext.y };
  } else {
    newV2 = { x: v2.x + d * normal.x, y: v2.y + d * normal.y };
  }

  // Sanity check: minimum edge length
  const newEdgeLen = Math.hypot(newV2.x - newV1.x, newV2.y - newV1.y);
  if (newEdgeLen < 0.1) return vertices;

  const newVerts = [...vertices];
  newVerts[edgeIndex] = newV1;
  newVerts[(edgeIndex + 1) % n] = newV2;

  // Verify non-zero area
  let area = 0;
  for (let i = 0; i < n; i++) {
    const pA = newVerts[i];
    const pB = newVerts[(i + 1) % n];
    area += pA.x * pB.y - pB.x * pA.y;
  }
  if (Math.abs(area) < 0.2) return vertices;

  return newVerts;
}

/**
 * Updates a BuildingLoop's segments and winding when its vertices change.
 */
export function updateBuildingWithNewVertices(
  building: BuildingLoop,
  newVertices: Point2D[]
): BuildingLoop {
  const isCCW = isPolygonCCW(newVertices);
  const updatedSegments = newVertices.map((p1, idx) => {
    const p2 = newVertices[(idx + 1) % newVertices.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const normal = calculateOutwardNormal(p1, p2, isCCW);
    const existingSeg = building.segments[idx] || building.segments[0];

    return {
      ...existingSeg,
      id: existingSeg ? existingSeg.id : `${building.id}-seg-${idx + 1}`,
      p1,
      p2,
      normal,
      length: len,
      angleRad: Math.atan2(dy, dx),
    };
  });

  return {
    ...building,
    vertices: newVertices,
    segments: updatedSegments,
    isClockwise: !isCCW,
  };
}


