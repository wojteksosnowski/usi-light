import { Point2D, BuildingLoop } from '../../types/geometry';
import polygonClipping from 'polygon-clipping';
import { buildRingSegments } from '../ringSegments';

/**
 * Calculates the signed area of a 2D polygon using the Shoelace formula / Green's theorem.
 * Positive => Counter-Clockwise (CCW)
 * Negative => Clockwise (CW)
 */
export function calculateSignedArea(points: Point2D[]): number {
  if (!points || points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    if (!p1 || !p2 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
      continue;
    }
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area / 2;
}

/**
 * Average (centroid) of a polygon's vertices — used as the pivot for
 * per-object rotation (rotate handle, align tool).
 */
export function getPolygonCentroid(vertices: Point2D[]): Point2D {
  if (!vertices || vertices.length === 0) return { x: 0, y: 0 };
  let x = 0, y = 0;
  for (const v of vertices) {
    x += v.x;
    y += v.y;
  }
  return { x: x / vertices.length, y: y / vertices.length };
}

/**
 * Rotates a point by `angleRad` (CCW, standard math convention) around `pivot`.
 * Shared by every place that needs to replicate a building's own rotation
 * math (rotate handle, `rotateBuilding`, canonical/local-space normalization).
 */
export function rotatePointAroundPivot(pt: Point2D, pivot: Point2D, angleRad: number): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const rx = pt.x - pivot.x;
  const ry = pt.y - pivot.y;
  return {
    x: rx * cos - ry * sin,
    y: rx * sin + ry * cos,
  };
}

const ROTATE_HANDLE_MARGIN_PX = 28;

/**
 * Screen position of the per-object rotate handle. Points at "12 o'clock"
 * relative to the object: straight up on screen when the building's own
 * rotation (`transform.rotationDeg`) is 0 and the view isn't rotated, then
 * turns rigidly with the building as it's rotated. The farthest-vertex
 * distance is kept only to size the offset so the handle clears the shape.
 */
export function getRotateHandleScreenPos(
  bldg: { vertices: Point2D[]; transform?: { rotationDeg?: number } },
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  scale: number,
  viewRotationDeg: number = 0
): { sx: number; sy: number } | null {
  if (!bldg.vertices || bldg.vertices.length === 0) return null;
  const centroid = getPolygonCentroid(bldg.vertices);
  let maxDistSq = -Infinity;
  for (const v of bldg.vertices) {
    const d = (v.x - centroid.x) ** 2 + (v.y - centroid.y) ** 2;
    if (d > maxDistSq) maxDistSq = d;
  }
  const dist = Math.sqrt(maxDistSq);

  // worldToScreen rotates world vectors by +viewRotationDeg before flipping Y,
  // so to land straight up on screen at rotationDeg=0 we need to counter-rotate
  // by viewRotationDeg here, then add the building's own rotation on top.
  const rotationDeg = bldg.transform?.rotationDeg || 0;
  const angleRad = ((rotationDeg - viewRotationDeg) * Math.PI) / 180;
  // (-sin, cos) is the "up" vector (0,1) rotated by angleRad using the same
  // CCW math convention as rotateBuilding (atan2-based deltas); using
  // (sin, cos) here would spin the handle opposite to the object/mouse.
  const dirX = -Math.sin(angleRad);
  const dirY = Math.cos(angleRad);

  const marginWorld = ROTATE_HANDLE_MARGIN_PX / (scale || 1);
  const worldPos = {
    x: centroid.x + dirX * (dist + marginWorld),
    y: centroid.y + dirY * (dist + marginWorld),
  };
  const s = worldToScreen(worldPos.x, worldPos.y);
  if (!Number.isFinite(s.sx) || !Number.isFinite(s.sy)) return null;
  return s;
}

export function isPolygonCCW(points: Point2D[]): boolean {
  if (!points || points.length < 3) return true;
  return calculateSignedArea(points) > 0;
}

/**
 * Checks if a point is inside a polygon using ray casting algorithm.
 */
export function isPointInPolygon(point: Point2D, vertices: Point2D[]): boolean {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !vertices || vertices.length < 3) {
    return false;
  }
  let inside = false;
  const { x, y } = point;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i];
    const vj = vertices[j];
    if (!vi || !vj || !Number.isFinite(vi.x) || !Number.isFinite(vi.y) || !Number.isFinite(vj.x) || !Number.isFinite(vj.y)) {
      continue;
    }
    const xi = vi.x,
      yi = vi.y;
    const xj = vj.x,
      yj = vj.y;

    const denom = yj - yi;
    if (Math.abs(denom) < 1e-9) {
      continue;
    }

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Checks if a point lies inside a polygon-with-holes (or a list of them): inside the outer
 * ring and not inside any of its holes.
 */
export function isPointInPolygonWithHoles(
  point: Point2D,
  pwhList: { outer: Point2D[]; holes?: Point2D[][] }[]
): boolean {
  for (const pwh of pwhList) {
    if (isPointInPolygon(point, pwh.outer)) {
      const inHole = pwh.holes?.some((h) => isPointInPolygon(point, h)) ?? false;
      if (!inHole) return true;
    }
  }
  return false;
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
 * Sprawdza czy wielokąt 2D jest ściśle wypukły (Convex).
 */
export function isPolygonConvex(polygon: Point2D[]): boolean {
  const n = polygon?.length || 0;
  if (n < 3) return false;
  let prevCross = 0;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const p3 = polygon[(i + 2) % n];
    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const dx2 = p3.x - p2.x;
    const dy2 = p3.y - p2.y;
    const cross = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(cross) > 1e-7) {
      if (prevCross === 0) {
        prevCross = cross;
      } else if ((cross > 0 && prevCross < 0) || (cross < 0 && prevCross > 0)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Pomocnicza funkcja łącząca poligony za pomocą polygonClipping.union
 */
/**
 * Pomocnicza funkcja normalizująca i zamykająca pierścień wielokąta z zaokrągleniem do zadanej precyzji.
 * Eliminuje zdegenerowane odcinki o zerowej długości i duplikaty wierzchołków.
 */
function toNormalizedClippingRing(poly: Point2D[], precision: number = 1000): [number, number][] | null {
  if (!poly || poly.length < 3) return null;
  const ring: [number, number][] = [];
  for (const pt of poly) {
    const x = Math.round(pt.x * precision) / precision;
    const y = Math.round(pt.y * precision) / precision;
    if (ring.length === 0 || ring[ring.length - 1][0] !== x || ring[ring.length - 1][1] !== y) {
      ring.push([x, y]);
    }
  }
  // Usunięcie zduplikowanego punktu końcowego jeśli pokrywa się z początkowym
  if (ring.length >= 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) {
    ring.pop();
  }
  if (ring.length < 3) return null;
  // Zamknięcie pierścienia dla polygon-clipping
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/**
 * Konwertuje wynik polygonClipping (MultiPolygon lub Polygon) z powrotem na tablicę Point2D[][].
 */
function clippingResultToLoops(unionResult: polygonClipping.MultiPolygon | polygonClipping.Polygon): Point2D[][] {
  const resultLoops: Point2D[][] = [];
  for (const poly of unionResult) {
    // poly może być Polygon (tablica Ring) lub bezpośrednio Ring jeśli unionResult to Polygon
    if (!Array.isArray(poly) || poly.length === 0) continue;
    if (typeof poly[0][0] === 'number') {
      // poly jest Ring: Pair[]
      const ring = poly as unknown as polygonClipping.Ring;
      if (ring.length >= 3) {
        const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
        const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
        resultLoops.push(ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y })));
      }
    } else {
      // poly jest Polygon: Ring[]
      for (const ring of poly as polygonClipping.Polygon) {
        if (ring.length >= 3) {
          const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
          const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
          resultLoops.push(ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y })));
        }
      }
    }
  }
  return resultLoops;
}

function crossSign(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Sprawdza czy dwa odcinki właściwie się przecinają (skrzyżowanie wewnątrz obu odcinków,
 * z pominięciem stykania się w punktach końcowych/współliniowości — interesują nas tylko
 * "twarde" przecięcia typu bowtie powstałe z naiwnego offsetu wierzchołkowego).
 */
function segmentsProperlyIntersect(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
  const d1 = crossSign(p3, p4, p1);
  const d2 = crossSign(p3, p4, p2);
  const d3 = crossSign(p1, p2, p3);
  const d4 = crossSign(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Sprawdza czy pierścień jest prosty (bez samoprzecięć krawędzi niesąsiadujących).
 * Używane by uruchomić kosztowną i topologię-zmieniającą naprawę (resolveSelfIntersectingRing)
 * tylko wtedy, gdy jest to faktycznie konieczne — dla poprawnych wielokątów zachowuje dokładny
 * układ wierzchołków bez przepuszczania przez polygon-clipping.
 */
export function isSimplePolygonRing(ring: Point2D[]): boolean {
  const n = ring.length;
  if (n < 4) return true;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const b1 = ring[j];
      const b2 = ring[(j + 1) % n];
      if (segmentsProperlyIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/**
 * Naprawia pojedynczy, potencjalnie samoprzecinający się pierścień (np. wynik naiwnego
 * offsetu wierzchołkowego na wklęsłym wielokącie) rozbijając go na proste, nieprzecinające
 * się kontury. Wykorzystuje polygonClipping.union na jednym pierścieniu — w przeciwieństwie
 * do unionPolygonLoops() nie ma skrótu dla pojedynczego wejścia, więc faktycznie uruchamia
 * silnik sweep-line i normalizuje topologię (bowtie → 1+ prostych wielokątów).
 * Zwraca listę posortowaną malejąco wg pola (największy kontur jako pierwszy).
 */
export function resolveSelfIntersectingRing(ring: Point2D[]): Point2D[][] {
  if (!ring || ring.length < 3) return ring ? [ring] : [];

  try {
    const normalized = toNormalizedClippingRing(ring);
    if (!normalized) return [ring];

    const unionResult = polygonClipping.union([normalized]);
    const loops = clippingResultToLoops(unionResult);
    if (loops.length === 0) return [ring];

    loops.sort((a, b) => Math.abs(calculateSignedArea(b)) - Math.abs(calculateSignedArea(a)));
    return loops;
  } catch {
    return [ring];
  }
}

export interface PolygonWithHoles {
  outer: Point2D[];
  holes: Point2D[][];
}

function clippingRingToPoints(ring: polygonClipping.Ring): Point2D[] | null {
  if (!ring || ring.length < 3) return null;
  const isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const sliceEnd = isClosed && ring.length > 3 ? ring.length - 1 : ring.length;
  const pts = ring.slice(0, sliceEnd).map(([x, y]) => ({ x, y }));
  return pts.length >= 3 ? pts : null;
}

/**
 * Konwertuje wynik polygonClipping (MultiPolygon lub Polygon) zachowując hierarchię
 * obrys zewnętrzny / otwory wewnętrzne zamiast spłaszczać wszystkie pierścienie.
 */
export function clippingResultToPolygonsWithHoles(
  unionResult: polygonClipping.MultiPolygon | polygonClipping.Polygon
): PolygonWithHoles[] {
  const result: PolygonWithHoles[] = [];
  for (const poly of unionResult) {
    if (!Array.isArray(poly) || poly.length === 0) continue;
    if (typeof poly[0][0] === 'number') {
      // poly jest pojedynczym Ring (unionResult to Polygon)
      const outer = clippingRingToPoints(poly as unknown as polygonClipping.Ring);
      if (outer) result.push({ outer, holes: [] });
    } else {
      const rings = poly as polygonClipping.Polygon;
      const outer = clippingRingToPoints(rings[0]);
      if (!outer) continue;
      const holes: Point2D[][] = [];
      for (let i = 1; i < rings.length; i++) {
        const hole = clippingRingToPoints(rings[i]);
        if (hole) holes.push(hole);
      }
      result.push({ outer, holes });
    }
  }
  return result;
}

/**
 * Konwertuje listę PolygonWithHoles do formatu biblioteki polygon-clipping (Polygon[]).
 */
export function polygonsWithHolesToClipping(pwhList: PolygonWithHoles[]): polygonClipping.Polygon[] {
  const result: polygonClipping.Polygon[] = [];
  for (const pwh of pwhList) {
    if (!pwh.outer || pwh.outer.length < 3) continue;
    const outerRing = toNormalizedClippingRing(pwh.outer, 1000);
    if (!outerRing) continue;
    const polygonRings: polygonClipping.Ring[] = [outerRing];
    if (pwh.holes && pwh.holes.length > 0) {
      for (const h of pwh.holes) {
        if (!h || h.length < 3) continue;
        const holeRing = toNormalizedClippingRing(h, 1000);
        if (holeRing) {
          polygonRings.push(holeRing);
        }
      }
    }
    result.push(polygonRings);
  }
  return result;
}

/**
 * Łączy wielokąty z otworami (Boolean Union) zachowując strukturę otwór-obrys.
 */
export function unionPolygonsWithHoles(polys: PolygonWithHoles[]): PolygonWithHoles[] {
  if (polys.length === 0) return [];
  const valid = polys.filter((p) => p.outer && p.outer.length >= 3);
  if (valid.length === 0) return [];
  if (valid.length === 1 && (!valid[0].holes || valid[0].holes.length === 0)) return valid;

  const clippingPolys = polygonsWithHolesToClipping(valid);
  if (clippingPolys.length === 0) return [];
  if (clippingPolys.length === 1) {
    return clippingResultToPolygonsWithHoles([clippingPolys[0]]);
  }

  try {
    if (clippingPolys.length <= 4) {
      const unionRes = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
      return clippingResultToPolygonsWithHoles(unionRes);
    } else {
      const batchedResult = batchUnionRings(clippingPolys);
      return clippingResultToPolygonsWithHoles(batchedResult);
    }
  } catch {
    try {
      const batchedResult = batchUnionRings(clippingPolys);
      const res = clippingResultToPolygonsWithHoles(batchedResult);
      return res.length > 0 ? res : valid;
    } catch {
      return valid;
    }
  }
}

/**
 * Odejmuje wielokąty negatywne od pozytywnych (A \ B) z zachowaniem otworów.
 */
export function differencePolygonsWithHoles(
  positivePolys: PolygonWithHoles[],
  negativePolys: PolygonWithHoles[]
): PolygonWithHoles[] {
  if (positivePolys.length === 0) return [];
  if (negativePolys.length === 0) return positivePolys;

  const cPos = polygonsWithHolesToClipping(positivePolys);
  const cNeg = polygonsWithHolesToClipping(negativePolys);
  if (cPos.length === 0) return [];
  if (cNeg.length === 0) return positivePolys;

  try {
    const diffResult = polygonClipping.difference(cPos as any, cNeg as any);
    return clippingResultToPolygonsWithHoles(diffResult);
  } catch {
    try {
      const uPos = batchUnionRings(cPos);
      const uNeg = batchUnionRings(cNeg);
      const diffResult = polygonClipping.difference(uPos, uNeg);
      return clippingResultToPolygonsWithHoles(diffResult);
    } catch {
      return positivePolys;
    }
  }
}

/**
 * Przecięcie wielokątów z otworami (A ∩ B).
 */
export function intersectionPolygonsWithHoles(
  listA: PolygonWithHoles[],
  listB: PolygonWithHoles[]
): PolygonWithHoles[] {
  if (listA.length === 0 || listB.length === 0) return [];

  const cA = polygonsWithHolesToClipping(listA);
  const cB = polygonsWithHolesToClipping(listB);
  if (cA.length === 0 || cB.length === 0) return [];

  try {
    const result = polygonClipping.intersection(cA as any, cB as any);
    return clippingResultToPolygonsWithHoles(result);
  } catch {
    try {
      const uA = batchUnionRings(cA);
      const uB = batchUnionRings(cB);
      const result = polygonClipping.intersection(uA, uB);
      return clippingResultToPolygonsWithHoles(result);
    } catch {
      return [];
    }
  }
}

/**
 * Odporna unia hierarchiczna parami (Pairwise Tree Reduction).
 * Łączy sąsiednie partie parami poziom po poziomie, co redukuje złożoność
 * sweep-line z O(N^2 log N) do O(N log N) i zapobiega dławieniu kolejki zdarzeń.
 */
function batchUnionRings(rings: polygonClipping.Polygon[]): polygonClipping.MultiPolygon {
  if (rings.length === 0) return [];
  if (rings.length === 1) return [rings[0]];

  let currentBatches: polygonClipping.MultiPolygon[] = rings.map((r) => [r]);

  while (currentBatches.length > 1) {
    const nextBatches: polygonClipping.MultiPolygon[] = [];
    for (let i = 0; i < currentBatches.length; i += 2) {
      if (i + 1 < currentBatches.length) {
        try {
          const merged = polygonClipping.union(currentBatches[i], currentBatches[i + 1]);
          if (merged && merged.length > 0) {
            nextBatches.push(merged);
          } else {
            nextBatches.push(currentBatches[i]);
            nextBatches.push(currentBatches[i + 1]);
          }
        } catch {
          nextBatches.push(currentBatches[i]);
          nextBatches.push(currentBatches[i + 1]);
        }
      } else {
        nextBatches.push(currentBatches[i]);
      }
    }
    if (nextBatches.length === currentBatches.length) {
      break;
    }
    currentBatches = nextBatches;
  }

  return currentBatches[0] || [];
}

/**
 * Pomocnicza funkcja łącząca poligony za pomocą zoptymalizowanej unii boolowskiej.
 * Wykorzystuje pre-filtrację AABB (izolowane poligony nie obciążają sweep-line),
 * normalizację 1mm oraz hierarchiczną redukcję drzewiastą.
 */
export function unionPolygonLoops(polygons: Point2D[][]): Point2D[][] {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return polygons;

  const validLoops = polygons.filter((p) => p && p.length >= 3);
  if (validLoops.length === 0) return [];
  if (validLoops.length === 1) return validLoops;

  // 1. Pre-filtracja AABB: podział na rozłączne komponenty spójności
  const bboxes = validLoops.map(computePointsBoundingBox);
  const n = validLoops.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n; i++) {
    const b1 = bboxes[i];
    for (let j = i + 1; j < n; j++) {
      const b2 = bboxes[j];
      if (b1.maxX >= b2.minX && b1.minX <= b2.maxX && b1.maxY >= b2.minY && b1.minY <= b2.maxY) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, Point2D[][]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    let group = clusters.get(root);
    if (!group) {
      group = [];
      clusters.set(root, group);
    }
    group.push(validLoops[i]);
  }

  const result: Point2D[][] = [];

  for (const group of clusters.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // 2. Normalizacja pierścieni dla danej nachodzącej grupy
    const clippingPolys: polygonClipping.Polygon[] = [];
    for (const poly of group) {
      const ring = toNormalizedClippingRing(poly, 1000);
      if (ring) {
        clippingPolys.push([ring]);
      }
    }

    if (clippingPolys.length === 0) continue;
    if (clippingPolys.length === 1) {
      result.push(...clippingResultToLoops([clippingPolys[0]]));
      continue;
    }

    // 3. Hierarchiczna unia partii parami dla nachodzących poligonów
    try {
      if (clippingPolys.length <= 4) {
        const unionRes = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
        result.push(...clippingResultToLoops(unionRes));
      } else {
        const batchedResult = batchUnionRings(clippingPolys);
        result.push(...clippingResultToLoops(batchedResult));
      }
    } catch {
      try {
        const batchedResult = batchUnionRings(clippingPolys);
        const loops = clippingResultToLoops(batchedResult);
        if (loops.length > 0) result.push(...loops);
        else result.push(...group);
      } catch {
        result.push(...group);
      }
    }
  }

  return result;
}

/**
 * Pomocnicza funkcja odejmująca poligony negatywne od poligonów pozytywnych (A \ B)
 * za pomocą polygonClipping.difference. Używana m.in. do negatywnego cienia.
 */
export function differencePolygonLoops(
  positiveLoops: Point2D[][],
  negativeLoops: Point2D[][]
): Point2D[][] {
  if (positiveLoops.length === 0) return [];
  if (negativeLoops.length === 0) return positiveLoops;

  const toClippingRings = (loops: Point2D[][]): polygonClipping.Polygon[] => {
    const list: polygonClipping.Polygon[] = [];
    for (const poly of loops) {
      const ring = toNormalizedClippingRing(poly, 1000);
      if (ring) {
        list.push([ring]);
      }
    }
    return list;
  };

  const cPos = toClippingRings(positiveLoops);
  const cNeg = toClippingRings(negativeLoops);
  if (cPos.length === 0) return [];
  if (cNeg.length === 0) return positiveLoops;

  try {
    // Bezpośrednie odejmowanie partii poligonów (A \ B) bez zbędnego potrójnego sweep-line (union + union + difference)
    const diffResult = polygonClipping.difference(cPos as any, cNeg as any);
    return clippingResultToLoops(diffResult);
  } catch {
    try {
      const uPos = batchUnionRings(cPos);
      const uNeg = batchUnionRings(cNeg);
      const diffResult = polygonClipping.difference(uPos, uNeg);
      return clippingResultToLoops(diffResult);
    } catch {
      return positiveLoops;
    }
  }
}

/**
 * Przecięcie dwóch zestawów poligonów (A ∩ B) za pomocą polygonClipping.intersection.
 * Używana m.in. do budowy umbry cienia z dwóch wariantów kątowych (masterplanGeometry.ts).
 */
export function intersectionPolygonLoops(loopsA: Point2D[][], loopsB: Point2D[][]): Point2D[][] {
  if (loopsA.length === 0 || loopsB.length === 0) return [];

  const toClippingRings = (loops: Point2D[][]): polygonClipping.Polygon[] => {
    const list: polygonClipping.Polygon[] = [];
    for (const poly of loops) {
      const ring = toNormalizedClippingRing(poly, 1000);
      if (ring) {
        list.push([ring]);
      }
    }
    return list;
  };

  const cA = toClippingRings(loopsA);
  const cB = toClippingRings(loopsB);
  if (cA.length === 0 || cB.length === 0) return [];

  try {
    const result = polygonClipping.intersection(cA as any, cB as any);
    return clippingResultToLoops(result);
  } catch {
    try {
      const uA = batchUnionRings(cA);
      const uB = batchUnionRings(cB);
      const result = polygonClipping.intersection(uA, uB);
      return clippingResultToLoops(result);
    } catch {
      return [];
    }
  }
}

export interface BooleanUnionResult {
  success: boolean;
  building?: BuildingLoop;
  error?: string;
}

/**
 * Wykonuje operację sumy boolowskiej (Boolean Union) na dwóch bryłach budynków.
 * Wymaga, aby obiekty się stykały (wspólna krawędź) lub przenikały (nachodzenie powierzchni).
 */
export function booleanUnionBuildings(
  bldgA: BuildingLoop,
  bldgB: BuildingLoop
): BooleanUnionResult {
  if (!bldgA || !bldgB || !bldgA.vertices || !bldgB.vertices) {
    return { success: false, error: 'Nieprawidłowe obiekty wejściowe.' };
  }
  if (bldgA.vertices.length < 3 || bldgB.vertices.length < 3) {
    return { success: false, error: 'Obiekty muszą posiadać co najmniej 3 wierzchołki.' };
  }

  const polyA: [number, number][] = bldgA.vertices.map((v) => [v.x, v.y]);
  const polyB: [number, number][] = bldgB.vertices.map((v) => [v.x, v.y]);

  if (polyA[0][0] !== polyA[polyA.length - 1][0] || polyA[0][1] !== polyA[polyA.length - 1][1]) {
    polyA.push([polyA[0][0], polyA[0][1]]);
  }
  if (polyB[0][0] !== polyB[polyB.length - 1][0] || polyB[0][1] !== polyB[polyB.length - 1][1]) {
    polyB.push([polyB[0][0], polyB[0][1]]);
  }

  try {
    const unionRes = polygonClipping.union([[polyA]], [[polyB]]);
    if (!unionRes || unionRes.length === 0) {
      return { success: false, error: 'Nie udało się połączyć obiektów.' };
    }

    if (unionRes.length > 1) {
      return {
        success: false,
        error: 'Obiekty muszą się stykać lub przenikać, aby wykonać sumę.',
      };
    }

    const pwh = clippingResultToPolygonsWithHoles(unionRes)[0];
    if (!pwh || pwh.outer.length < 4) {
      return { success: false, error: 'Wynik sumy nie tworzy poprawnego wielokąta.' };
    }

    const isCCW = isPolygonCCW(pwh.outer);
    const finalVertices = isCCW ? pwh.outer : [...pwh.outer].reverse();
    const finalHoles = pwh.holes.length > 0 ? pwh.holes.map((h) => (isCCW ? h : [...h].reverse())) : undefined;

    const newId = `bldg-union-${Date.now().toString(36)}`;
    const maxHeight = Math.max(bldgA.defaultHeight || 15, bldgB.defaultHeight || 15);
    const mergedName = `${bldgA.name || 'Obiekt'} + ${bldgB.name || 'Obiekt'}`;
    const mergedMeta = {
      id: newId,
      elevation: 0,
      defaultHeight: maxHeight,
      hWindowBottom: bldgA.hWindowBottom ?? 0.85,
      isCityCentre: bldgA.isCityCentre || bldgB.isCityCentre || false,
      buildingType: bldgA.buildingType || 'residential',
    } as const;

    const segments = buildRingSegments(mergedMeta, finalVertices, isCCW, `${newId}-seg`, 0);
    if (finalHoles) {
      for (let h = 0; h < finalHoles.length; h++) {
        // Hole rings wind opposite to the outer ring (evenodd fill). `buildRingSegments`'s normal
        // formula returns the direction away from a ring's own interior when given its true
        // winding — for a hole we want the opposite (pointing INTO the void), so we deliberately
        // pass `isCCW` (the outer ring's winding, i.e. the complement of this hole ring's actual one).
        segments.push(...buildRingSegments(mergedMeta, finalHoles[h], isCCW, `${newId}-hole${h}-seg`, h + 1));
      }
    }

    const mergedBuilding: BuildingLoop = {
      id: newId,
      name: mergedName,
      layer: bldgA.layer || 'Domyślna (0)',
      isTested: bldgA.isTested || bldgB.isTested || false,
      isIncluded: true,
      isCityCentre: mergedMeta.isCityCentre,
      buildingType: mergedMeta.buildingType,
      defaultHeight: maxHeight,
      hWindowBottom: mergedMeta.hWindowBottom,
      vertices: finalVertices,
      holes: finalHoles,
      segments,
      isClockwise: !isCCW,
      transform: {
        tx: 0,
        ty: 0,
        rotationDeg: 0,
      },
    };

    return {
      success: true,
      building: mergedBuilding,
    };

  } catch (err: any) {
    return {
      success: false,
      error: `Błąd podczas łączenia wielokątów: ${err?.message || 'Nieznany błąd'}`,
    };
  }
}

/**
 * Oblicza pole powierzchni wielokąta 2D (wzór Gaussa / Shoelace formula).
 */
export function computePolygonArea(vertices: Point2D[]): number {
  if (!vertices || vertices.length < 3) return 0;
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Oblicza łączną powierzchnię 2D zbioru obiektów / wielokątów z uwzględnieniem sumy boolowskiej
 * (nakładające się fragmenty nie są liczone podwójnie, otwory są odejmowane).
 */
export function computeBuildingsUnionArea(buildings: Array<{ vertices: Point2D[] }>): number {
  if (!buildings || buildings.length === 0) return 0;

  const validPolys = buildings
    .map((b) => b.vertices)
    .filter((v) => Array.isArray(v) && v.length >= 3);

  if (validPolys.length === 0) return 0;
  if (validPolys.length === 1) return computePolygonArea(validPolys[0]);

  const clippingPolys: [number, number][][][] = [];
  for (const poly of validPolys) {
    const ring: [number, number][] = poly.map((p) => [p.x, p.y]);
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push([ring[0][0], ring[0][1]]);
    }
    clippingPolys.push([ring]);
  }

  try {
    const unionResult = polygonClipping.union(clippingPolys[0], ...clippingPolys.slice(1));
    let totalArea = 0;

    for (const polygon of unionResult) {
      if (!Array.isArray(polygon) || polygon.length === 0) continue;
      const outerRing = polygon[0];
      totalArea += computePolygonArea(outerRing.map(([x, y]) => ({ x, y })));

      for (let i = 1; i < polygon.length; i++) {
        const holeRing = polygon[i];
        totalArea -= computePolygonArea(holeRing.map(([x, y]) => ({ x, y })));
      }
    }
    return Math.max(0, totalArea);
  } catch {
    return validPolys.reduce((sum, p) => sum + computePolygonArea(p), 0);
  }
}

/**
 * Wyznacza punkt leżący ściśle wewnątrz wielokąta (bezpieczny dla pozycjonowania etykiet).
 * W przypadku figur wklęsłych / L-kształtnych zapobiega umieszczeniu etykiety poza obrysem (pole of inaccessibility).
 */
export function getPolygonInteriorPoint(vertices: Point2D[]): Point2D {
  if (!vertices || vertices.length < 3) return { x: 0, y: 0 };
  if (vertices.length === 3) {
    return {
      x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
      y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3,
    };
  }

  // 1. Oblicz centroid
  let sumX = 0;
  let sumY = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const v of vertices) {
    sumX += v.x;
    sumY += v.y;
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  const centroid = { x: sumX / vertices.length, y: sumY / vertices.length };

  const getDistToBoundary = (pt: Point2D): number => {
    let minDist = Infinity;
    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % vertices.length];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLenSq = dx * dx + dy * dy;
      let dist = 0;
      if (segLenSq < 1e-8) {
        dist = Math.hypot(pt.x - p1.x, pt.y - p1.y);
      } else {
        const t = Math.max(0, Math.min(1, ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / segLenSq));
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        dist = Math.hypot(pt.x - projX, pt.y - projY);
      }
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  };

  if (isPointInPolygon(centroid, vertices)) {
    const cDist = getDistToBoundary(centroid);
    const boxSpan = Math.max(maxX - minX, maxY - minY);
    if (cDist >= boxSpan * 0.1) {
      return centroid;
    }
  }

  // 2. Próbkowanie siatki wewnątrz obwiedni w poszukiwaniu najgłębszego punktu wnętrza
  const steps = 14;
  const stepX = (maxX - minX) / steps;
  const stepY = (maxY - minY) / steps;
  let bestPt = centroid;
  let bestDist = -1;

  for (let ix = 1; ix < steps; ix++) {
    for (let iy = 1; iy < steps; iy++) {
      const candidate = { x: minX + ix * stepX, y: minY + iy * stepY };
      if (isPointInPolygon(candidate, vertices)) {
        const d = getDistToBoundary(candidate);
        if (d > bestDist) {
          bestDist = d;
          bestPt = candidate;
        }
      }
    }
  }

  return bestPt;
}

/**
 * Szacuje stosunek pola wielokąta znajdującego się wewnątrz okręgu do całkowitego pola wielokąta.
 * Używa próbkowania siatki — wydajne dla wielokątów geodezyjnych w zasięgu 50–200 m.
 *
 * @param vertices  wierzchołki wielokąta w lokalnym układzie CAD (metry, środek projektu = 0,0)
 * @param cx        środek okręgu X (zwykle 0 dla środka projektu)
 * @param cy        środek okręgu Y (zwykle 0 dla środka projektu)
 * @param radius    promień okręgu w metrach
 * @returns         liczba z zakresu [0, 1] — udział pola wielokąta wewnątrz okręgu
 */
/** Obwiednia (bounding box) zbioru punktów. */
export function computePointsBoundingBox(points: Point2D[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

export function polygonCircleIntersectionRatio(
  vertices: Point2D[],
  cx: number,
  cy: number,
  radius: number
): number {
  if (!vertices || vertices.length < 3 || radius <= 0) return 0;

  // Oblicz obwiednię wielokąta
  const { minX, maxX, minY, maxY } = computePointsBoundingBox(vertices);

  const STEPS = 20; // 20x20 = 400 punktów próbkowania
  const dx = (maxX - minX) / STEPS;
  const dy = (maxY - minY) / STEPS;
  const r2 = radius * radius;

  if (dx < 1e-9 || dy < 1e-9) {
    // Zdegenerowany wielokąt — sprawdź sam środek
    const pt = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    if (!isPointInPolygon(pt, vertices)) return 0;
    const dd = (pt.x - cx) ** 2 + (pt.y - cy) ** 2;
    return dd <= r2 ? 1 : 0;
  }

  let inside = 0;
  let total = 0;

  for (let ix = 0; ix <= STEPS; ix++) {
    for (let iy = 0; iy <= STEPS; iy++) {
      const pt: Point2D = { x: minX + ix * dx, y: minY + iy * dy };
      if (!isPointInPolygon(pt, vertices)) continue;
      total++;
      const dd = (pt.x - cx) ** 2 + (pt.y - cy) ** 2;
      if (dd <= r2) inside++;
    }
  }

  if (total === 0) return 0;
  return inside / total;
}

function ringFingerprint(ring: Point2D[]): string {
  let s = String(ring.length);
  for (const p of ring) {
    s += `:${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }
  return s;
}

function holesFingerprint(holes: Point2D[][] | undefined): string {
  if (!holes || holes.length === 0) return '';
  return holes.map(ringFingerprint).join('|');
}

/**
 * Scala ciąg kolejnych elementów o identycznym obrysie (i identycznych dziurach) w jeden,
 * obejmujący pełny zakres wysokości od hBottom pierwszego do hTop ostatniego elementu ciągu.
 * Bezstratne dla cienia: dla ciągu "plasterków" tej samej sylwetki przesuwanych wzdłuż tego
 * samego kierunku (wektora słońca), unia ich cieni jest dokładnie równa cieniowi jednego
 * połączonego zakresu wysokości — więc scalanie nie jest przybliżeniem, tylko redukcją liczby
 * elementów wejściowych bez zmiany wyniku. Wymaga ciągłości (hTop[i] ≈ hBottom[i+1], epsilon 1mm)
 * — nigdy nie mości realnej przerwy wysokości mimo identycznego obrysu.
 */
export function collapseIdenticalConsecutiveHeightRuns<T>(
  items: T[],
  getPolygon: (item: T) => Point2D[],
  getHoles: (item: T) => Point2D[][] | undefined,
  getHBottom: (item: T) => number,
  getHTop: (item: T) => number,
  withMergedRange: (last: T, hBottom: number, hTop: number) => T
): T[] {
  if (items.length <= 1) return items;

  const result: T[] = [];
  let runStart = items[0];
  let runStartFingerprint = ringFingerprint(getPolygon(runStart)) + '#' + holesFingerprint(getHoles(runStart));
  let runLast = runStart;

  for (let i = 1; i < items.length; i++) {
    const curr = items[i];
    const currFingerprint = ringFingerprint(getPolygon(curr)) + '#' + holesFingerprint(getHoles(curr));
    const contiguous = Math.abs(getHTop(runLast) - getHBottom(curr)) < 0.001;

    if (contiguous && currFingerprint === runStartFingerprint) {
      runLast = curr;
      continue;
    }

    result.push(runLast === runStart ? runStart : withMergedRange(runLast, getHBottom(runStart), getHTop(runLast)));
    runStart = curr;
    runStartFingerprint = currFingerprint;
    runLast = curr;
  }

  result.push(runLast === runStart ? runStart : withMergedRange(runLast, getHBottom(runStart), getHTop(runLast)));
  return result;
}
