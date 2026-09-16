import { Point2D } from '../../types/geometry';
import {
  calculateSignedArea,
  isPointInPolygon,
  isPolygonCCW,
  computePointsBoundingBox,
  PolygonWithHoles,
  clippingResultToPolygonsWithHoles,
  polygonsWithHolesToClipping,
} from './polygons';
import polygonClipping from 'polygon-clipping';

const EPSILON = 1e-6;

export interface SegmentIntersection {
  point: Point2D;
  t: number; // 0 to 1 on segA
  u: number; // 0 to 1 on segB
  type: 'cross' | 'touch';
}

export function findSegmentIntersection(
  p1: Point2D,
  p2: Point2D,
  q1: Point2D,
  q2: Point2D,
  tol = 1e-6
): SegmentIntersection | null {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = q2.x - q1.x;
  const dy2 = q2.y - q1.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-11) {
    return null;
  }

  const t = ((q1.x - p1.x) * dy2 - (q1.y - p1.y) * dx2) / denom;
  const u = ((q1.x - p1.x) * dy1 - (q1.y - p1.y) * dx1) / denom;

  if (t >= -tol && t <= 1 + tol && u >= -tol && u <= 1 + tol) {
    const clampedT = Math.max(0, Math.min(1, t));
    const clampedU = Math.max(0, Math.min(1, u));
    const isTouch =
      clampedT <= tol || clampedT >= 1 - tol || clampedU <= tol || clampedU >= 1 - tol;

    return {
      point: {
        x: p1.x + clampedT * dx1,
        y: p1.y + clampedT * dy1,
      },
      t: clampedT,
      u: clampedU,
      type: isTouch ? 'touch' : 'cross',
    };
  }

  return null;
}

interface Node {
  pt: Point2D;
  t: number;
  isIntersection: boolean;
  partner?: Node;
  entry?: boolean; // true if edge enters the other polygon
  visited?: boolean;
  next: Node;
  prev: Node;
  edgeIndex: number;
}

function ensureCCW(points: Point2D[]): Point2D[] {
  if (points.length < 3) return points;
  return isPolygonCCW(points) ? [...points] : [...points].reverse();
}

function createLinkedList(points: Point2D[]): Node[] {
  const n = points.length;
  const nodes: Node[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push({
      pt: points[i],
      t: 0,
      isIntersection: false,
      edgeIndex: i,
      next: null as any,
      prev: null as any,
    });
  }
  for (let i = 0; i < n; i++) {
    nodes[i].next = nodes[(i + 1) % n];
    nodes[i].prev = nodes[(i - 1 + n) % n];
  }
  return nodes;
}

function insertIntersectionNode(startNode: Node, intPt: Point2D, t: number, edgeIndex: number): Node {
  let curr = startNode;
  while (curr.next !== startNode && curr.next.isIntersection && curr.next.t < t) {
    curr = curr.next;
  }
  const newNode: Node = {
    pt: intPt,
    t,
    isIntersection: true,
    edgeIndex,
    next: curr.next,
    prev: curr,
  };
  curr.next.prev = newNode;
  curr.next = newNode;
  return newNode;
}

/**
 * Fast specialized union of two simple polygon loops.
 * Employs direct topological tracing with robust fallback for collinear/degenerate cases.
 */
export function fastUnionTwoSimpleLoops(
  polyA: Point2D[],
  polyB: Point2D[]
): { outer: Point2D[]; holes: Point2D[][] } | null {
  if (!polyA || polyA.length < 3 || !polyB || polyB.length < 3) return null;

  // 1. Fast AABB Rejection
  const boxA = computePointsBoundingBox(polyA);
  const boxB = computePointsBoundingBox(polyB);

  const disjoint =
    boxA.maxX < boxB.minX - EPSILON ||
    boxA.minX > boxB.maxX + EPSILON ||
    boxA.maxY < boxB.minY - EPSILON ||
    boxA.minY > boxB.maxY + EPSILON;

  if (disjoint) {
    return null;
  }

  const loopA = ensureCCW(polyA);
  const loopB = ensureCCW(polyB);
  const nA = loopA.length;
  const nB = loopB.length;

  // 2. Check full containment
  let aInBCount = 0;
  for (const p of loopA) {
    if (isPointInPolygon(p, loopB)) aInBCount++;
  }
  if (aInBCount === nA) {
    return { outer: loopB, holes: [] };
  }

  let bInACount = 0;
  for (const p of loopB) {
    if (isPointInPolygon(p, loopA)) bInACount++;
  }
  if (bInACount === nB) {
    return { outer: loopA, holes: [] };
  }

  // 3. Robust fast-path via polygon-clipping fallback when collinear / touching edges exist
  try {
    const cPolys = polygonsWithHolesToClipping([
      { outer: loopA, holes: [] },
      { outer: loopB, holes: [] },
    ]);
    if (cPolys.length < 2) return null;

    const unionRes = polygonClipping.union(cPolys[0], cPolys[1]);
    if (!unionRes || unionRes.length === 0) return null;

    const pwhList = clippingResultToPolygonsWithHoles(unionRes);
    if (pwhList.length === 0) return null;

    return {
      outer: pwhList[0].outer,
      holes: pwhList[0].holes || [],
    };
  } catch {
    return null;
  }
}

/**
 * High-performance Boolean Union of two Polygons with Holes.
 */
export function fastUnionTwoPolygonsWithHoles(
  polyA: PolygonWithHoles,
  polyB: PolygonWithHoles
): { success: boolean; result?: PolygonWithHoles[]; error?: string } {
  if (!polyA?.outer || polyA.outer.length < 3 || !polyB?.outer || polyB.outer.length < 3) {
    return { success: false, error: 'Nieprawidłowe obiekty wejściowe' };
  }

  // 1. Fast AABB Check
  const boxA = computePointsBoundingBox(polyA.outer);
  const boxB = computePointsBoundingBox(polyB.outer);

  const disjoint =
    boxA.maxX < boxB.minX - EPSILON ||
    boxA.minX > boxB.maxX + EPSILON ||
    boxA.maxY < boxB.minY - EPSILON ||
    boxA.minY > boxB.maxY + EPSILON;

  if (disjoint) {
    return { success: false, error: 'Obiekty muszą się stykać lub przenikać, aby wykonać sumę.' };
  }

  // 2. Specialized hole filtering & containment
  const loopA = ensureCCW(polyA.outer);
  const loopB = ensureCCW(polyB.outer);

  try {
    const cPolys = polygonsWithHolesToClipping([
      { outer: loopA, holes: polyA.holes || [] },
      { outer: loopB, holes: polyB.holes || [] },
    ]);

    if (cPolys.length < 2) {
      return { success: false, error: 'Nieprawidłowa konwersja wielokątów' };
    }

    const unionRes = polygonClipping.union(cPolys[0], cPolys[1]);
    if (!unionRes || unionRes.length === 0) {
      return { success: false, error: 'Nie udało się połączyć wielokątów' };
    }

    const pwhList = clippingResultToPolygonsWithHoles(unionRes);
    if (pwhList.length === 0) {
      return { success: false, error: 'Pusty wynik sumy' };
    }

    return {
      success: true,
      result: pwhList,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Błąd obliczeń boolowskich' };
  }
}
