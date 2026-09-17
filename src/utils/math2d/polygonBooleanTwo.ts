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

// Canonical tolerance set. All stage-specific epsilons below are derived from LEN_TOL
// so that segment-intersection, vertex-snapping, AABB pre-filtering and collinearity
// checks agree on what counts as "the same point" — previously these were 8 independently
// chosen literals spanning ~8 orders of magnitude, which could disagree on borderline
// geometry (shared/near-touching edges, near-duplicate vertices) and break the
// vertex-pool graph the traversal relies on, forcing a fallback to polygon-clipping.
const LEN_TOL = 1e-6; // canonical linear distance tolerance
const SNAP_TOL = 1e-3; // vertex pooling distance: must be >= AABB/param tolerances below
const SNAP_TOL_SQ = SNAP_TOL * SNAP_TOL;
const AABB_SLOP = SNAP_TOL; // bbox pre-filter must never reject what snapping would merge
const PARAM_TOL = LEN_TOL; // t/u clamp + min-subsegment-length tolerance (unified)
const PARALLEL_DENOM_TOL = 1e-9; // "are these two directions parallel" (dimensionally distinct from LEN_TOL)
const TURN_TOL = 1e-9; // normalized (scale-invariant) turn tie-break tolerance
const DUP_VERTEX_LEN_TOL_SQ = LEN_TOL * LEN_TOL; // squared-distance duplicate-vertex threshold

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
  if (Math.abs(denom) < PARALLEL_DENOM_TOL) {
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

// Sorts a split-parameter array in place and drops literal duplicates, avoiding a
// `Set` + `Array.from` allocation per edge. The real tolerance-based collapse of
// near-duplicate values still happens later via the `tEnd - tStart < 1e-6` check,
// so dropping only exact duplicates here changes nothing about the result.
function dedupeSorted(values: number[]): number[] {
  values.sort((a, b) => a - b);
  let writeIdx = 1;
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1]) values[writeIdx++] = values[i];
  }
  values.length = writeIdx;
  return values;
}

function ensureCCW(points: Point2D[]): Point2D[] {
  if (points.length < 3) return points;
  return isPolygonCCW(points) ? [...points] : [...points].reverse();
}

function cleanDuplicateOrCollinearVertices(points: Point2D[]): Point2D[] {
  const n = points.length;
  if (n < 3) return points;
  const res: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1Sq = dx1 * dx1 + dy1 * dy1;
    if (len1Sq < DUP_VERTEX_LEN_TOL_SQ) continue; // duplicate vertex

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2Sq = dx2 * dx2 + dy2 * dy2;
    if (len2Sq < DUP_VERTEX_LEN_TOL_SQ) continue;

    const cross = dx1 * dy2 - dy1 * dx2;
    const dot = dx1 * dx2 + dy1 * dy2;
    // Strictly collinear and in the same forward direction. Normalized by edge
    // length (same convention as the collinear-edge split test below) so this
    // agrees with segment-splitting regardless of edge-length scale.
    const normalizedCross = Math.abs(cross) / Math.sqrt(len1Sq);
    if (normalizedCross < PARAM_TOL && dot > 0) {
      continue;
    }
    res.push(curr);
  }
  return res.length >= 3 ? res : points;
}

/**
 * Porównuje dwa wektory wyjściowe (aDx, aDy) i (bDx, bDy) względem wektora wejściowego (inDx, inDy).
 * Zwraca true, jeśli wektor A wykonuje zwrot bardziej w prawo (bardziej ujemny kąt w zakresie (-π, π]),
 * deterministycznie w O(1) na podstawie iloczynu wektorowego (cross product Ax+By+C=0) bez Math.atan2.
 */
function isTurnMoreRight(
  inDx: number,
  inDy: number,
  aDx: number,
  aDy: number,
  bDx: number,
  bDy: number
): boolean {
  // Normalize cross products by vector magnitudes so the tie-break tolerance is
  // scale-invariant instead of comparing raw coordinate-difference products (which,
  // for typical plan-unit magnitudes of tens-hundreds, put a fixed 1e-11 near float64
  // precision noise).
  const inLen = Math.sqrt(inDx * inDx + inDy * inDy) || 1;
  const aLen = Math.sqrt(aDx * aDx + aDy * aDy) || 1;
  const bLen = Math.sqrt(bDx * bDx + bDy * bDy) || 1;

  const cpA = (inDx * aDy - inDy * aDx) / (inLen * aLen);
  const cpB = (inDx * bDy - inDy * bDx) / (inLen * bLen);

  const isRightA = cpA < -TURN_TOL || (Math.abs(cpA) <= TURN_TOL && (inDx * aDx + inDy * aDy) > 0);
  const isRightB = cpB < -TURN_TOL || (Math.abs(cpB) <= TURN_TOL && (inDx * bDx + inDy * bDy) > 0);

  if (isRightA !== isRightB) {
    return isRightA; // Prawa półpłaszczyzna (zwrot w prawo) ma mniejszy kąt niż lewa
  }

  // Obie leżą po tej samej stronie: iloczyn wektorowy A x B
  const crossAB = aDx * bDy - aDy * bDx;
  return crossAB > 0;
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
  while (curr.next !== startNode && curr.next.isIntersection && curr.next.edgeIndex === edgeIndex && curr.next.t < t) {
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

export interface FastUnionTelemetry {
  totalCalls: number;
  disjointExits: number;
  containmentExits: number;
  fastPathSuccess: number;
  fallbackCalls: number;
  // Per-reason breakdown of why the fast path fell back, for diagnosing which
  // tolerance/edge-case is actually being hit on real data.
  insufficientSegmentsExits: number;
  multipleOuterComponentsExits: number;
  emptyLoopsExits: number;
  caughtExceptionExits: number;
}

const EMPTY_TELEMETRY: FastUnionTelemetry = {
  totalCalls: 0,
  disjointExits: 0,
  containmentExits: 0,
  fastPathSuccess: 0,
  fallbackCalls: 0,
  insufficientSegmentsExits: 0,
  multipleOuterComponentsExits: 0,
  emptyLoopsExits: 0,
  caughtExceptionExits: 0,
};

let globalTelemetry: FastUnionTelemetry = { ...EMPTY_TELEMETRY };

export function resetFastUnionTelemetry(): void {
  globalTelemetry = { ...EMPTY_TELEMETRY };
}

export function getFastUnionTelemetry(): FastUnionTelemetry {
  return { ...globalTelemetry };
}

/**
 * Fast specialized union of two simple polygon loops.
 * Employs direct topological tracing with robust fallback for collinear/degenerate cases.
 */
export function fastUnionTwoSimpleLoops(
  polyA: Point2D[],
  polyB: Point2D[]
): { outer: Point2D[]; holes: Point2D[][] } | null {
  globalTelemetry.totalCalls++;

  if (!polyA || polyA.length < 3 || !polyB || polyB.length < 3) return null;

  // 1. Fast AABB Rejection
  const boxA = computePointsBoundingBox(polyA);
  const boxB = computePointsBoundingBox(polyB);

  const disjoint =
    boxA.maxX < boxB.minX - LEN_TOL ||
    boxA.minX > boxB.maxX + LEN_TOL ||
    boxA.maxY < boxB.minY - LEN_TOL ||
    boxA.minY > boxB.maxY + LEN_TOL;

  if (disjoint) {
    globalTelemetry.disjointExits++;
    return null;
  }

  const loopA = isPolygonCCW(polyA) ? polyA : [...polyA].reverse();
  const loopB = isPolygonCCW(polyB) ? polyB : [...polyB].reverse();
  const nA = loopA.length;
  const nB = loopB.length;

  // 2. Check full containment (fast early-exit)
  let aInB = true;
  for (let i = 0; i < nA; i++) {
    if (!isPointInPolygon(loopA[i], loopB, SNAP_TOL)) {
      aInB = false;
      break;
    }
  }
  if (aInB) {
    globalTelemetry.containmentExits++;
    return { outer: loopB, holes: [] };
  }

  let bInA = true;
  for (let j = 0; j < nB; j++) {
    if (!isPointInPolygon(loopB[j], loopA, SNAP_TOL)) {
      bInA = false;
      break;
    }
  }
  if (bInA) {
    globalTelemetry.containmentExits++;
    return { outer: loopA, holes: [] };
  }

  // 3. Robust Universal Segment-Subdivision & Shared Boundary Stitching with Integer-Keyed VertexPool
  try {
    const vertexPool: Point2D[] = [];

    const getVertexId = (pt: Point2D): number => {
      const px = pt.x;
      const py = pt.y;
      for (let i = 0; i < vertexPool.length; i++) {
        const vp = vertexPool[i];
        const dx = vp.x - px;
        const dy = vp.y - py;
        if (dx * dx + dy * dy <= SNAP_TOL_SQ) {
          return i;
        }
      }
      const id = vertexPool.length;
      vertexPool.push({ x: px, y: py });
      return id;
    };

    // A. Collect split parameters for all edges of loopA and loopB
    const splitsA: number[][] = Array.from({ length: nA }, () => [0, 1]);
    const splitsB: number[][] = Array.from({ length: nB }, () => [0, 1]);

    // Pre-extract loopB edge properties to avoid quadratic recomputation per edge of loopA
    const bMinX = new Float64Array(nB);
    const bMaxX = new Float64Array(nB);
    const bMinY = new Float64Array(nB);
    const bMaxY = new Float64Array(nB);
    const bDx = new Float64Array(nB);
    const bDy = new Float64Array(nB);
    const bLenSq = new Float64Array(nB);

    for (let j = 0; j < nB; j++) {
      const b1 = loopB[j];
      const b2 = loopB[(j + 1) % nB];
      const dx2 = b2.x - b1.x;
      const dy2 = b2.y - b1.y;
      bDx[j] = dx2;
      bDy[j] = dy2;
      bLenSq[j] = dx2 * dx2 + dy2 * dy2;
      bMinX[j] = dx2 > 0 ? b1.x : b2.x;
      bMaxX[j] = dx2 > 0 ? b2.x : b1.x;
      bMinY[j] = dy2 > 0 ? b1.y : b2.y;
      bMaxY[j] = dy2 > 0 ? b2.y : b1.y;
    }

    for (let i = 0; i < nA; i++) {
      const a1 = loopA[i];
      const a2 = loopA[(i + 1) % nA];
      const dx1 = a2.x - a1.x;
      const dy1 = a2.y - a1.y;
      const len1Sq = dx1 * dx1 + dy1 * dy1;
      if (len1Sq < DUP_VERTEX_LEN_TOL_SQ) continue;

      const aMinX = dx1 > 0 ? a1.x : a2.x;
      const aMaxX = dx1 > 0 ? a2.x : a1.x;
      const aMinY = dy1 > 0 ? a1.y : a2.y;
      const aMaxY = dy1 > 0 ? a2.y : a1.y;

      for (let j = 0; j < nB; j++) {
        const len2Sq = bLenSq[j];
        if (len2Sq < DUP_VERTEX_LEN_TOL_SQ) continue;

        if (aMaxX < bMinX[j] - AABB_SLOP || aMinX > bMaxX[j] + AABB_SLOP) continue;
        if (aMaxY < bMinY[j] - AABB_SLOP || aMinY > bMaxY[j] + AABB_SLOP) continue;

        const b1 = loopB[j];
        const dx2 = bDx[j];
        const dy2 = bDy[j];

        const denom = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denom) < PARALLEL_DENOM_TOL) {
          // Collinear test: check if b1 or b2 lie on segment a1->a2
          const cross1 = (b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1;
          if (Math.abs(cross1) / Math.sqrt(len1Sq) < SNAP_TOL) {
            const b2 = loopB[(j + 1) % nB];
            const t_b1 = ((b1.x - a1.x) * dx1 + (b1.y - a1.y) * dy1) / len1Sq;
            const t_b2 = ((b2.x - a1.x) * dx1 + (b2.y - a1.y) * dy1) / len1Sq;
            if (t_b1 > PARAM_TOL && t_b1 < 1 - PARAM_TOL) splitsA[i].push(t_b1);
            if (t_b2 > PARAM_TOL && t_b2 < 1 - PARAM_TOL) splitsB[j].push(t_b2);

            const u_a1 = ((a1.x - b1.x) * dx2 + (a1.y - b1.y) * dy2) / len2Sq;
            const u_a2 = ((a2.x - b1.x) * dx2 + (a2.y - b1.y) * dy2) / len2Sq;
            if (u_a1 > PARAM_TOL && u_a1 < 1 - PARAM_TOL) splitsB[j].push(u_a1);
            if (u_a2 > PARAM_TOL && u_a2 < 1 - PARAM_TOL) splitsB[j].push(u_a2);
          }
          continue;
        }

        const qx = b1.x - a1.x;
        const qy = b1.y - a1.y;
        const t = (qx * dy2 - qy * dx2) / denom;
        const u = (qx * dy1 - qy * dx1) / denom;

        if (t >= -PARAM_TOL && t <= 1 + PARAM_TOL && u >= -PARAM_TOL && u <= 1 + PARAM_TOL) {
          const clampedT = Math.max(0, Math.min(1, t));
          const clampedU = Math.max(0, Math.min(1, u));
          if (clampedT > PARAM_TOL && clampedT < 1 - PARAM_TOL) splitsA[i].push(clampedT);
          if (clampedU > PARAM_TOL && clampedU < 1 - PARAM_TOL) splitsB[j].push(clampedU);
        }
      }
    }

    // B. Build atomic directed subsegments
    interface SubSegment {
      u: number;
      v: number;
      p1: Point2D;
      p2: Point2D;
      source: 'A' | 'B';
    }

    const subsegsA: SubSegment[] = [];
    for (let i = 0; i < nA; i++) {
      const a1 = loopA[i];
      const a2 = loopA[(i + 1) % nA];
      const dx = a2.x - a1.x;
      const dy = a2.y - a1.y;
      const ts = dedupeSorted(splitsA[i]);
      for (let k = 0; k < ts.length - 1; k++) {
        const tStart = ts[k];
        const tEnd = ts[k + 1];
        if (tEnd - tStart < PARAM_TOL) continue;
        const pt1 = { x: a1.x + tStart * dx, y: a1.y + tStart * dy };
        const pt2 = { x: a1.x + tEnd * dx, y: a1.y + tEnd * dy };
        const u = getVertexId(pt1);
        const v = getVertexId(pt2);
        if (u !== v) {
          subsegsA.push({ u, v, p1: vertexPool[u], p2: vertexPool[v], source: 'A' });
        }
      }
    }

    const subsegsB: SubSegment[] = [];
    for (let j = 0; j < nB; j++) {
      const b1 = loopB[j];
      const b2 = loopB[(j + 1) % nB];
      const dx = b2.x - b1.x;
      const dy = b2.y - b1.y;
      const ts = dedupeSorted(splitsB[j]);
      for (let k = 0; k < ts.length - 1; k++) {
        const tStart = ts[k];
        const tEnd = ts[k + 1];
        if (tEnd - tStart < PARAM_TOL) continue;
        const pt1 = { x: b1.x + tStart * dx, y: b1.y + tStart * dy };
        const pt2 = { x: b1.x + tEnd * dx, y: b1.y + tEnd * dy };
        const u = getVertexId(pt1);
        const v = getVertexId(pt2);
        if (u !== v) {
          subsegsB.push({ u, v, p1: vertexPool[u], p2: vertexPool[v], source: 'B' });
        }
      }
    }

    // C. Classify subsegments
    const keptSegments: SubSegment[] = [];
    const bMatched = new Uint8Array(subsegsB.length);

    // Order-independent pair key for O(1) shared/cancelling-edge lookup instead of
    // an O(subsegsA * subsegsB) brute-force scan. Vertex ids are small pool indices,
    // so a multiplier well above any realistic pool size avoids collisions.
    const PAIR_KEY_MULT = 1 << 20;
    const pairKeyOf = (u: number, v: number): number =>
      u < v ? u * PAIR_KEY_MULT + v : v * PAIR_KEY_MULT + u;

    const bPairIndex = new Map<number, number[]>();
    for (let j = 0; j < subsegsB.length; j++) {
      const segB = subsegsB[j];
      const key = pairKeyOf(segB.u, segB.v);
      let list = bPairIndex.get(key);
      if (!list) {
        list = [];
        bPairIndex.set(key, list);
      }
      list.push(j);
    }

    for (let i = 0; i < subsegsA.length; i++) {
      const segA = subsegsA[i];
      const midA = { x: (segA.p1.x + segA.p2.x) / 2, y: (segA.p1.y + segA.p2.y) / 2 };

      // Check if segA matches any segment on B (shared or touching)
      let matchIdx = -1;
      let isCoDirectional = true;
      const candidates = bPairIndex.get(pairKeyOf(segA.u, segA.v));
      if (candidates) {
        for (let k = 0; k < candidates.length; k++) {
          const j = candidates[k];
          const segB = subsegsB[j];
          if (segA.u === segB.u && segA.v === segB.v) {
            matchIdx = j;
            isCoDirectional = true;
            break;
          }
          if (segA.u === segB.v && segA.v === segB.u) {
            matchIdx = j;
            isCoDirectional = false;
            break;
          }
        }
      }

      if (matchIdx >= 0) {
        bMatched[matchIdx] = 1;
        if (isCoDirectional) {
          // Shared outer boundary edge (e.g. building base in hourly shadow) -> keep once
          keptSegments.push(segA);
        } else {
          // Contra-directional touching internal interface -> cancel both
          continue;
        }
      } else {
        // Not a shared edge: keep if midpoint is strictly outside loopB
        if (
          midA.x < boxB.minX - AABB_SLOP ||
          midA.x > boxB.maxX + AABB_SLOP ||
          midA.y < boxB.minY - AABB_SLOP ||
          midA.y > boxB.maxY + AABB_SLOP ||
          !isPointInPolygon(midA, loopB)
        ) {
          keptSegments.push(segA);
        }
      }
    }

    for (let j = 0; j < subsegsB.length; j++) {
      if (bMatched[j]) continue;
      const segB = subsegsB[j];
      const midB = { x: (segB.p1.x + segB.p2.x) / 2, y: (segB.p1.y + segB.p2.y) / 2 };
      if (
        midB.x < boxA.minX - AABB_SLOP ||
        midB.x > boxA.maxX + AABB_SLOP ||
        midB.y < boxA.minY - AABB_SLOP ||
        midB.y > boxA.maxY + AABB_SLOP ||
        !isPointInPolygon(midB, loopA)
      ) {
        keptSegments.push(segB);
      }
    }

    if (keptSegments.length < 3) {
      globalTelemetry.insufficientSegmentsExits++;
      throw new Error('Insufficient kept segments');
    }

    // D. Assemble closed loops from directed segments using Forward-Star Flat Graph (Zero Allocations)
    const numSegs = keptSegments.length;
    const numVerts = vertexPool.length;

    const firstOutEdge = new Int32Array(numVerts).fill(-1);
    const nextOutEdge = new Int32Array(numSegs);
    const edgeVisited = new Uint8Array(numSegs);

    for (let i = 0; i < numSegs; i++) {
      const u = keptSegments[i].u;
      nextOutEdge[i] = firstOutEdge[u];
      firstOutEdge[u] = i;
    }

    const loops: Point2D[][] = [];
    const loopAbsAreas: number[] = [];
    const maxSteps = numSegs * 4 + 10;

    for (let startIdx = 0; startIdx < numSegs; startIdx++) {
      if (edgeVisited[startIdx]) continue;

      const currentLoop: Point2D[] = [];
      let currEdgeIdx = startIdx;
      const startU = keptSegments[startIdx].u;
      let steps = 0;

      while (currEdgeIdx >= 0 && !edgeVisited[currEdgeIdx] && steps++ < maxSteps) {
        edgeVisited[currEdgeIdx] = 1;
        const seg = keptSegments[currEdgeIdx];
        currentLoop.push(seg.p1);

        const nextU = seg.v;
        if (nextU === startU) {
          break;
        }

        // Znajdź unikalne lub najlepsze wychodzące krawędzie z nextU
        let bestEdge = -1;
        let candCount = 0;

        for (let e = firstOutEdge[nextU]; e !== -1; e = nextOutEdge[e]) {
          if (edgeVisited[e] === 0) {
            if (candCount === 0) {
              bestEdge = e;
              candCount = 1;
            } else {
              // Wybór najbardziej zewnętrznego zwrotu w prawo przez 2D cross product Ax+By+C=0 (bez Math.atan2)
              const inDx = seg.p2.x - seg.p1.x;
              const inDy = seg.p2.y - seg.p1.y;

              const bestSeg = keptSegments[bestEdge];
              const bestDx = bestSeg.p2.x - bestSeg.p1.x;
              const bestDy = bestSeg.p2.y - bestSeg.p1.y;

              const candSeg = keptSegments[e];
              const candDx = candSeg.p2.x - candSeg.p1.x;
              const candDy = candSeg.p2.y - candSeg.p1.y;

              if (isTurnMoreRight(inDx, inDy, candDx, candDy, bestDx, bestDy)) {
                bestEdge = e;
              }
              candCount++;
            }
          }
        }

        currEdgeIdx = bestEdge;
      }

      if (currentLoop.length >= 3) {
        const cleaned = cleanDuplicateOrCollinearVertices(currentLoop);
        const absArea = Math.abs(calculateSignedArea(cleaned));
        if (cleaned.length >= 3 && absArea > 1e-4) {
          loops.push(cleaned);
          loopAbsAreas.push(absArea);
        }
      }
    }

    if (loops.length > 0) {
      const order = loops.map((_, i) => i);
      order.sort((i1, i2) => loopAbsAreas[i2] - loopAbsAreas[i1]);
      const sortedLoops = order.map((i) => loops[i]);
      const outer = ensureCCW(sortedLoops[0]);
      const holes: Point2D[][] = [];
      let hasMultipleOuterComponents = false;

      for (let i = 1; i < sortedLoops.length; i++) {
        const loop = sortedLoops[i];
        // Robust 3-sample containment test instead of a single vertex:
        // a hole loop's first vertex alone can sit within float error of the outer
        // boundary and be misclassified as "outside", wrongly triggering the
        // multiple-outer-components fallback for a legitimate hole.
        const n = loop.length;
        const samples = n >= 3 ? [loop[0], loop[Math.floor(n / 3)], loop[Math.floor((2 * n) / 3)]] : [loop[0]];
        const insideVotes = samples.filter((pt) => isPointInPolygon(pt, outer, SNAP_TOL)).length;
        const isHole = insideVotes > 0; // treat as hole unless every sample is outside

        if (isHole) {
          holes.push(isPolygonCCW(loop) ? [...loop].reverse() : loop);
        } else {
          hasMultipleOuterComponents = true;
          break;
        }
      }

      if (!hasMultipleOuterComponents) {
        globalTelemetry.fastPathSuccess++;
        return { outer, holes };
      }
      globalTelemetry.multipleOuterComponentsExits++;
    } else {
      globalTelemetry.emptyLoopsExits++;
    }
  } catch {
    globalTelemetry.caughtExceptionExits++;
    // Proceed to fallback
  }

  // 5. Robust fallback via polygon-clipping for extreme micro-degenerate cases
  globalTelemetry.fallbackCalls++;

  try {
    const cPolys = polygonsWithHolesToClipping([
      { outer: loopA, holes: [] },
      { outer: loopB, holes: [] },
    ]);
    if (cPolys.length < 2) return null;

    const unionRes = polygonClipping.union(cPolys[0], cPolys[1]);
    if (!unionRes || unionRes.length === 0) return null;

    const pwhList = clippingResultToPolygonsWithHoles(unionRes);
    if (pwhList.length === 0 || pwhList.length > 1) return null;

    return {
      outer: pwhList[0].outer,
      holes: pwhList[0].holes || [],
    };
  } catch {
    return null;
  }
}

export interface FastDifferenceTelemetry {
  totalCalls: number;
  // B doesn't touch A at all (AABB-disjoint) -> A returned unchanged, no clipping needed.
  disjointExits: number;
  // A fully inside B -> A entirely consumed, empty result.
  aFullyConsumedExits: number;
  // B fully inside A, no boundary contact -> classic donut (A with a B-shaped hole).
  holeExits: number;
  fastPathSuccess: number;
  fallbackCalls: number;
  insufficientSegmentsExits: number;
  ambiguousNestingExits: number;
  emptyLoopsExits: number;
  caughtExceptionExits: number;
}

const EMPTY_DIFFERENCE_TELEMETRY: FastDifferenceTelemetry = {
  totalCalls: 0,
  disjointExits: 0,
  aFullyConsumedExits: 0,
  holeExits: 0,
  fastPathSuccess: 0,
  fallbackCalls: 0,
  insufficientSegmentsExits: 0,
  ambiguousNestingExits: 0,
  emptyLoopsExits: 0,
  caughtExceptionExits: 0,
};

let globalDifferenceTelemetry: FastDifferenceTelemetry = { ...EMPTY_DIFFERENCE_TELEMETRY };

export function resetFastDifferenceTelemetry(): void {
  globalDifferenceTelemetry = { ...EMPTY_DIFFERENCE_TELEMETRY };
}

export function getFastDifferenceTelemetry(): FastDifferenceTelemetry {
  return { ...globalDifferenceTelemetry };
}

/**
 * Fast specialized difference (A \ B) of two simple polygon loops — the difference
 * analogue of fastUnionTwoSimpleLoops. Avoids polygon-clipping's sweep-line by reusing
 * the same segment-subdivision + directed-graph-traversal machinery, with the keep-rule
 * flipped: A's edges are kept where they lie OUTSIDE B (unchanged from union), and B's
 * edges are kept — REVERSED — where they lie INSIDE A (opposite of union, which keeps
 * them where they lie outside A, in their original direction).
 *
 * Unlike union, multiple disjoint outer components in the traced result are a normal,
 * expected outcome (B can "bite" A into two separate pieces), not a failure signal.
 *
 * Returns an array of { outer, holes } pieces (possibly empty if A is fully consumed by
 * B), or `null` if even the polygon-clipping fallback failed — callers should treat
 * `null` as "could not compute this pair, handle it some other way" (see
 * differencePolygonLoops's per-loop fallback chain in polygons.ts).
 */
export function fastDifferenceTwoSimpleLoops(
  polyA: Point2D[],
  polyB: Point2D[]
): { outer: Point2D[]; holes: Point2D[][] }[] | null {
  globalDifferenceTelemetry.totalCalls++;

  if (!polyA || polyA.length < 3) return null;
  if (!polyB || polyB.length < 3) return [{ outer: polyA, holes: [] }];

  // 1. Fast AABB Rejection — B doesn't touch A at all, A passes through unchanged.
  const boxA = computePointsBoundingBox(polyA);
  const boxB = computePointsBoundingBox(polyB);

  const disjoint =
    boxA.maxX < boxB.minX - LEN_TOL ||
    boxA.minX > boxB.maxX + LEN_TOL ||
    boxA.maxY < boxB.minY - LEN_TOL ||
    boxA.minY > boxB.maxY + LEN_TOL;

  if (disjoint) {
    globalDifferenceTelemetry.disjointExits++;
    return [{ outer: polyA, holes: [] }];
  }

  const loopA = isPolygonCCW(polyA) ? polyA : [...polyA].reverse();
  const loopB = isPolygonCCW(polyB) ? polyB : [...polyB].reverse();
  const nA = loopA.length;
  const nB = loopB.length;

  // 2. Full-containment early exits (no edge intersections to trace)
  let aInB = true;
  for (let i = 0; i < nA; i++) {
    if (!isPointInPolygon(loopA[i], loopB, SNAP_TOL)) {
      aInB = false;
      break;
    }
  }
  if (aInB) {
    globalDifferenceTelemetry.aFullyConsumedExits++;
    return [];
  }

  let bInA = true;
  for (let j = 0; j < nB; j++) {
    if (!isPointInPolygon(loopB[j], loopA, SNAP_TOL)) {
      bInA = false;
      break;
    }
  }
  if (bInA) {
    globalDifferenceTelemetry.holeExits++;
    return [{ outer: loopA, holes: [isPolygonCCW(loopB) ? [...loopB].reverse() : loopB] }];
  }

  // 3. Boundary-intersecting case: same segment-subdivision machinery as
  // fastUnionTwoSimpleLoops (steps A & B below are verbatim-equivalent).
  try {
    const vertexPool: Point2D[] = [];

    const getVertexId = (pt: Point2D): number => {
      const px = pt.x;
      const py = pt.y;
      for (let i = 0; i < vertexPool.length; i++) {
        const vp = vertexPool[i];
        const dx = vp.x - px;
        const dy = vp.y - py;
        if (dx * dx + dy * dy <= SNAP_TOL_SQ) {
          return i;
        }
      }
      const id = vertexPool.length;
      vertexPool.push({ x: px, y: py });
      return id;
    };

    // A. Collect split parameters for all edges of loopA and loopB
    const splitsA: number[][] = Array.from({ length: nA }, () => [0, 1]);
    const splitsB: number[][] = Array.from({ length: nB }, () => [0, 1]);

    // Pre-extract loopB edge properties to avoid quadratic recomputation per edge of loopA
    const bMinX = new Float64Array(nB);
    const bMaxX = new Float64Array(nB);
    const bMinY = new Float64Array(nB);
    const bMaxY = new Float64Array(nB);
    const bDx = new Float64Array(nB);
    const bDy = new Float64Array(nB);
    const bLenSq = new Float64Array(nB);

    for (let j = 0; j < nB; j++) {
      const b1 = loopB[j];
      const b2 = loopB[(j + 1) % nB];
      const dx2 = b2.x - b1.x;
      const dy2 = b2.y - b1.y;
      bDx[j] = dx2;
      bDy[j] = dy2;
      bLenSq[j] = dx2 * dx2 + dy2 * dy2;
      bMinX[j] = dx2 > 0 ? b1.x : b2.x;
      bMaxX[j] = dx2 > 0 ? b2.x : b1.x;
      bMinY[j] = dy2 > 0 ? b1.y : b2.y;
      bMaxY[j] = dy2 > 0 ? b2.y : b1.y;
    }

    for (let i = 0; i < nA; i++) {
      const a1 = loopA[i];
      const a2 = loopA[(i + 1) % nA];
      const dx1 = a2.x - a1.x;
      const dy1 = a2.y - a1.y;
      const len1Sq = dx1 * dx1 + dy1 * dy1;
      if (len1Sq < DUP_VERTEX_LEN_TOL_SQ) continue;

      const aMinX = dx1 > 0 ? a1.x : a2.x;
      const aMaxX = dx1 > 0 ? a2.x : a1.x;
      const aMinY = dy1 > 0 ? a1.y : a2.y;
      const aMaxY = dy1 > 0 ? a2.y : a1.y;

      for (let j = 0; j < nB; j++) {
        const len2Sq = bLenSq[j];
        if (len2Sq < DUP_VERTEX_LEN_TOL_SQ) continue;

        if (aMaxX < bMinX[j] - AABB_SLOP || aMinX > bMaxX[j] + AABB_SLOP) continue;
        if (aMaxY < bMinY[j] - AABB_SLOP || aMinY > bMaxY[j] + AABB_SLOP) continue;

        const b1 = loopB[j];
        const dx2 = bDx[j];
        const dy2 = bDy[j];

        const denom = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denom) < PARALLEL_DENOM_TOL) {
          const cross1 = (b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1;
          if (Math.abs(cross1) / Math.sqrt(len1Sq) < SNAP_TOL) {
            const b2 = loopB[(j + 1) % nB];
            const t_b1 = ((b1.x - a1.x) * dx1 + (b1.y - a1.y) * dy1) / len1Sq;
            const t_b2 = ((b2.x - a1.x) * dx1 + (b2.y - a1.y) * dy1) / len1Sq;
            if (t_b1 > PARAM_TOL && t_b1 < 1 - PARAM_TOL) splitsA[i].push(t_b1);
            if (t_b2 > PARAM_TOL && t_b2 < 1 - PARAM_TOL) splitsB[j].push(t_b2);

            const u_a1 = ((a1.x - b1.x) * dx2 + (a1.y - b1.y) * dy2) / len2Sq;
            const u_a2 = ((a2.x - b1.x) * dx2 + (a2.y - b1.y) * dy2) / len2Sq;
            if (u_a1 > PARAM_TOL && u_a1 < 1 - PARAM_TOL) splitsB[j].push(u_a1);
            if (u_a2 > PARAM_TOL && u_a2 < 1 - PARAM_TOL) splitsB[j].push(u_a2);
          }
          continue;
        }

        const qx = b1.x - a1.x;
        const qy = b1.y - a1.y;
        const t = (qx * dy2 - qy * dx2) / denom;
        const u = (qx * dy1 - qy * dx1) / denom;

        if (t >= -PARAM_TOL && t <= 1 + PARAM_TOL && u >= -PARAM_TOL && u <= 1 + PARAM_TOL) {
          const clampedT = Math.max(0, Math.min(1, t));
          const clampedU = Math.max(0, Math.min(1, u));
          if (clampedT > PARAM_TOL && clampedT < 1 - PARAM_TOL) splitsA[i].push(clampedT);
          if (clampedU > PARAM_TOL && clampedU < 1 - PARAM_TOL) splitsB[j].push(clampedU);
        }
      }
    }

    interface SubSegment {
      u: number;
      v: number;
      p1: Point2D;
      p2: Point2D;
      source: 'A' | 'B';
    }

    const subsegsA: SubSegment[] = [];
    for (let i = 0; i < nA; i++) {
      const a1 = loopA[i];
      const a2 = loopA[(i + 1) % nA];
      const dx = a2.x - a1.x;
      const dy = a2.y - a1.y;
      const ts = dedupeSorted(splitsA[i]);
      for (let k = 0; k < ts.length - 1; k++) {
        const tStart = ts[k];
        const tEnd = ts[k + 1];
        if (tEnd - tStart < PARAM_TOL) continue;
        const pt1 = { x: a1.x + tStart * dx, y: a1.y + tStart * dy };
        const pt2 = { x: a1.x + tEnd * dx, y: a1.y + tEnd * dy };
        const u = getVertexId(pt1);
        const v = getVertexId(pt2);
        if (u !== v) {
          subsegsA.push({ u, v, p1: vertexPool[u], p2: vertexPool[v], source: 'A' });
        }
      }
    }

    const subsegsB: SubSegment[] = [];
    for (let j = 0; j < nB; j++) {
      const b1 = loopB[j];
      const b2 = loopB[(j + 1) % nB];
      const dx = b2.x - b1.x;
      const dy = b2.y - b1.y;
      const ts = dedupeSorted(splitsB[j]);
      for (let k = 0; k < ts.length - 1; k++) {
        const tStart = ts[k];
        const tEnd = ts[k + 1];
        if (tEnd - tStart < PARAM_TOL) continue;
        const pt1 = { x: b1.x + tStart * dx, y: b1.y + tStart * dy };
        const pt2 = { x: b1.x + tEnd * dx, y: b1.y + tEnd * dy };
        const u = getVertexId(pt1);
        const v = getVertexId(pt2);
        if (u !== v) {
          subsegsB.push({ u, v, p1: vertexPool[u], p2: vertexPool[v], source: 'B' });
        }
      }
    }

    // C. Classify subsegments. A-side rule is identical to union (keep where outside
    // B). B-side rule is the mirror image of union's: keep where INSIDE A, and REVERSE
    // the segment direction — a B edge carved into A's interior bounds a hole, so it
    // must run clockwise relative to A's CCW outer boundary.
    const keptSegments: SubSegment[] = [];
    const bMatched = new Uint8Array(subsegsB.length);

    const PAIR_KEY_MULT = 1 << 20;
    const pairKeyOf = (u: number, v: number): number =>
      u < v ? u * PAIR_KEY_MULT + v : v * PAIR_KEY_MULT + u;

    const bPairIndex = new Map<number, number[]>();
    for (let j = 0; j < subsegsB.length; j++) {
      const segB = subsegsB[j];
      const key = pairKeyOf(segB.u, segB.v);
      let list = bPairIndex.get(key);
      if (!list) {
        list = [];
        bPairIndex.set(key, list);
      }
      list.push(j);
    }

    for (let i = 0; i < subsegsA.length; i++) {
      const segA = subsegsA[i];
      const midA = { x: (segA.p1.x + segA.p2.x) / 2, y: (segA.p1.y + segA.p2.y) / 2 };

      let matchIdx = -1;
      let isCoDirectional = true;
      const candidates = bPairIndex.get(pairKeyOf(segA.u, segA.v));
      if (candidates) {
        for (let k = 0; k < candidates.length; k++) {
          const j = candidates[k];
          const segB = subsegsB[j];
          if (segA.u === segB.u && segA.v === segB.v) {
            matchIdx = j;
            isCoDirectional = true;
            break;
          }
          if (segA.u === segB.v && segA.v === segB.u) {
            matchIdx = j;
            isCoDirectional = false;
            break;
          }
        }
      }

      if (matchIdx >= 0) {
        bMatched[matchIdx] = 1;
        if (isCoDirectional) {
          // Shared boundary edge (A and B trace the identical edge) -> keep once, on A's side.
          keptSegments.push(segA);
        } else {
          // Contra-directional touching interface -> cancel both, no contribution.
          continue;
        }
      } else {
        if (
          midA.x < boxB.minX - AABB_SLOP ||
          midA.x > boxB.maxX + AABB_SLOP ||
          midA.y < boxB.minY - AABB_SLOP ||
          midA.y > boxB.maxY + AABB_SLOP ||
          !isPointInPolygon(midA, loopB)
        ) {
          keptSegments.push(segA);
        }
      }
    }

    for (let j = 0; j < subsegsB.length; j++) {
      if (bMatched[j]) continue;
      const segB = subsegsB[j];
      const midB = { x: (segB.p1.x + segB.p2.x) / 2, y: (segB.p1.y + segB.p2.y) / 2 };
      if (
        midB.x >= boxA.minX - AABB_SLOP &&
        midB.x <= boxA.maxX + AABB_SLOP &&
        midB.y >= boxA.minY - AABB_SLOP &&
        midB.y <= boxA.maxY + AABB_SLOP &&
        isPointInPolygon(midB, loopA)
      ) {
        // Reversed: this B edge now bounds the hole carved into A, not B's own outside.
        keptSegments.push({ u: segB.v, v: segB.u, p1: segB.p2, p2: segB.p1, source: 'B' });
      }
    }

    if (keptSegments.length < 3) {
      globalDifferenceTelemetry.insufficientSegmentsExits++;
      throw new Error('Insufficient kept segments');
    }

    // D. Assemble closed loops from directed segments (identical traversal to union).
    const numSegs = keptSegments.length;
    const numVerts = vertexPool.length;

    const firstOutEdge = new Int32Array(numVerts).fill(-1);
    const nextOutEdge = new Int32Array(numSegs);
    const edgeVisited = new Uint8Array(numSegs);

    for (let i = 0; i < numSegs; i++) {
      const u = keptSegments[i].u;
      nextOutEdge[i] = firstOutEdge[u];
      firstOutEdge[u] = i;
    }

    const loops: Point2D[][] = [];
    const loopAbsAreas: number[] = [];
    const maxSteps = numSegs * 4 + 10;

    for (let startIdx = 0; startIdx < numSegs; startIdx++) {
      if (edgeVisited[startIdx]) continue;

      const currentLoop: Point2D[] = [];
      let currEdgeIdx = startIdx;
      const startU = keptSegments[startIdx].u;
      let steps = 0;

      while (currEdgeIdx >= 0 && !edgeVisited[currEdgeIdx] && steps++ < maxSteps) {
        edgeVisited[currEdgeIdx] = 1;
        const seg = keptSegments[currEdgeIdx];
        currentLoop.push(seg.p1);

        const nextU = seg.v;
        if (nextU === startU) {
          break;
        }

        let bestEdge = -1;
        let candCount = 0;

        for (let e = firstOutEdge[nextU]; e !== -1; e = nextOutEdge[e]) {
          if (edgeVisited[e] === 0) {
            if (candCount === 0) {
              bestEdge = e;
              candCount = 1;
            } else {
              const inDx = seg.p2.x - seg.p1.x;
              const inDy = seg.p2.y - seg.p1.y;

              const bestSeg = keptSegments[bestEdge];
              const bestDx = bestSeg.p2.x - bestSeg.p1.x;
              const bestDy = bestSeg.p2.y - bestSeg.p1.y;

              const candSeg = keptSegments[e];
              const candDx = candSeg.p2.x - candSeg.p1.x;
              const candDy = candSeg.p2.y - candSeg.p1.y;

              if (isTurnMoreRight(inDx, inDy, candDx, candDy, bestDx, bestDy)) {
                bestEdge = e;
              }
              candCount++;
            }
          }
        }

        currEdgeIdx = bestEdge;
      }

      if (currentLoop.length >= 3) {
        const cleaned = cleanDuplicateOrCollinearVertices(currentLoop);
        const absArea = Math.abs(calculateSignedArea(cleaned));
        if (cleaned.length >= 3 && absArea > 1e-4) {
          loops.push(cleaned);
          loopAbsAreas.push(absArea);
        }
      }
    }

    if (loops.length === 0) {
      globalDifferenceTelemetry.emptyLoopsExits++;
      throw new Error('No loops assembled');
    }

    // E. Multi-outer nesting classification: unlike union, more than one outer
    // component is a normal, expected result (B splitting A into separate pieces),
    // not a failure. Largest-first greedy nesting: each loop becomes a hole of the
    // first already-accepted outer that contains it, else a new top-level outer.
    const order = loops.map((_, i) => i);
    order.sort((i1, i2) => loopAbsAreas[i2] - loopAbsAreas[i1]);
    const sortedLoops = order.map((i) => loops[i]);
    const sortedAreas = order.map((i) => loopAbsAreas[i]);

    const outers: Point2D[][] = [];
    const outerAreas: number[] = [];
    const holesFor: Point2D[][][] = [];

    for (let li = 0; li < sortedLoops.length; li++) {
      const loop = sortedLoops[li];
      const n = loop.length;
      const samples = n >= 3 ? [loop[0], loop[Math.floor(n / 3)], loop[Math.floor((2 * n) / 3)]] : [loop[0]];

      let parentIdx = -1;
      for (let oi = 0; oi < outers.length; oi++) {
        const votes = samples.filter((pt) => isPointInPolygon(pt, outers[oi], SNAP_TOL)).length;
        if (votes > 0) {
          parentIdx = oi;
          break;
        }
      }

      if (parentIdx >= 0) {
        // Sanity guard: a hole can never be larger than its parent outer — a violation
        // means the nesting classification is ambiguous (e.g. degenerate geometry), so
        // bail out to the robust polygon-clipping fallback instead of trusting it.
        if (sortedAreas[li] >= outerAreas[parentIdx]) {
          globalDifferenceTelemetry.ambiguousNestingExits++;
          throw new Error('Ambiguous hole/outer nesting');
        }
        holesFor[parentIdx].push(isPolygonCCW(loop) ? [...loop].reverse() : loop);
      } else {
        outers.push(ensureCCW(loop));
        outerAreas.push(sortedAreas[li]);
        holesFor.push([]);
      }
    }

    globalDifferenceTelemetry.fastPathSuccess++;
    return outers.map((outer, i) => ({ outer, holes: holesFor[i] }));
  } catch {
    globalDifferenceTelemetry.caughtExceptionExits++;
    // Proceed to fallback
  }

  // 4. Robust fallback via polygon-clipping for degenerate/ambiguous cases
  globalDifferenceTelemetry.fallbackCalls++;

  try {
    const cPos = polygonsWithHolesToClipping([{ outer: loopA, holes: [] }]);
    const cNeg = polygonsWithHolesToClipping([{ outer: loopB, holes: [] }]);
    if (cPos.length < 1 || cNeg.length < 1) return null;

    const diffRes = polygonClipping.difference(cPos[0], cNeg[0]);
    if (!diffRes) return null;
    if (diffRes.length === 0) return [];

    const pwhList = clippingResultToPolygonsWithHoles(diffRes);
    return pwhList.map((p) => ({ outer: p.outer, holes: p.holes || [] }));
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
    boxA.maxX < boxB.minX - LEN_TOL ||
    boxA.minX > boxB.maxX + LEN_TOL ||
    boxA.maxY < boxB.minY - LEN_TOL ||
    boxA.minY > boxB.maxY + LEN_TOL;

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
