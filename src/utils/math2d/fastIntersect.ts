import { Point2D } from '../../types/geometry';
import {
  calculateSignedArea,
  isPointInPolygon,
  isPolygonCCW,
  computePointsBoundingBox,
} from './polygons';

const LEN_TOL = 1e-6;
const SNAP_TOL = 1e-3;
const SNAP_TOL_SQ = SNAP_TOL * SNAP_TOL;
const AABB_SLOP = SNAP_TOL;
const PARAM_TOL = LEN_TOL;
const PARALLEL_DENOM_TOL = 1e-9;
const TURN_TOL = 1e-9;
const DUP_VERTEX_LEN_TOL_SQ = LEN_TOL * LEN_TOL;

export interface FastIntersectionTelemetry {
  totalCalls: number;
  disjointExits: number;
  containmentAExits: number;
  containmentBExits: number;
  fastPathSuccess: number;
  fallbackCalls: number;
  insufficientSegmentsExits: number;
  emptyLoopsExits: number;
  caughtExceptionExits: number;
}

const EMPTY_INTERSECTION_TELEMETRY: FastIntersectionTelemetry = {
  totalCalls: 0,
  disjointExits: 0,
  containmentAExits: 0,
  containmentBExits: 0,
  fastPathSuccess: 0,
  fallbackCalls: 0,
  insufficientSegmentsExits: 0,
  emptyLoopsExits: 0,
  caughtExceptionExits: 0,
};

let globalIntersectionTelemetry: FastIntersectionTelemetry = { ...EMPTY_INTERSECTION_TELEMETRY };

export function resetFastIntersectionTelemetry(): void {
  globalIntersectionTelemetry = { ...EMPTY_INTERSECTION_TELEMETRY };
}

export function getFastIntersectionTelemetry(): FastIntersectionTelemetry {
  return { ...globalIntersectionTelemetry };
}

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
    if (len1Sq < DUP_VERTEX_LEN_TOL_SQ) continue;

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2Sq = dx2 * dx2 + dy2 * dy2;
    if (len2Sq < DUP_VERTEX_LEN_TOL_SQ) continue;

    const cross = dx1 * dy2 - dy1 * dx2;
    const dot = dx1 * dx2 + dy1 * dy2;
    const normalizedCross = Math.abs(cross) / Math.sqrt(len1Sq);
    if (normalizedCross < PARAM_TOL && dot > 0) {
      continue;
    }
    res.push(curr);
  }
  return res.length >= 3 ? res : points;
}

function isTurnMoreRight(
  inDx: number,
  inDy: number,
  aDx: number,
  aDy: number,
  bDx: number,
  bDy: number
): boolean {
  const inLen = Math.sqrt(inDx * inDx + inDy * inDy) || 1;
  const aLen = Math.sqrt(aDx * aDx + aDy * aDy) || 1;
  const bLen = Math.sqrt(bDx * bDx + bDy * bDy) || 1;

  const cpA = (inDx * aDy - inDy * aDx) / (inLen * aLen);
  const cpB = (inDx * bDy - inDy * bDx) / (inLen * bLen);

  const isRightA = cpA < -TURN_TOL || (Math.abs(cpA) <= TURN_TOL && (inDx * aDx + inDy * aDy) > 0);
  const isRightB = cpB < -TURN_TOL || (Math.abs(cpB) <= TURN_TOL && (inDx * bDx + inDy * bDy) > 0);

  if (isRightA !== isRightB) {
    return isRightA;
  }

  const crossAB = aDx * bDy - aDy * bDx;
  return crossAB > 0;
}

/**
 * Sprawdza, czy punkt leży wewnątrz prostej pętli (Ray-Casting algorithm).
 */
export function isPointInsideSimpleLoop(p: Point2D, poly: Point2D[]): boolean {
  return isPointInPolygon(p, poly, SNAP_TOL);
}

/**
 * Fast specialized intersection (A ∩ B) of two simple polygon loops.
 * Employs direct topological tracing with robust fallback for degenerate cases.
 */
export function fastIntersectTwoSimpleLoops(
  polyA: Point2D[],
  polyB: Point2D[],
  fallbackFn: (a: Point2D[], b: Point2D[]) => Point2D[][]
): Point2D[][] {
  globalIntersectionTelemetry.totalCalls++;

  if (!polyA || polyA.length < 3 || !polyB || polyB.length < 3) return [];

  // 1. Fast AABB Rejection (O(1))
  const boxA = computePointsBoundingBox(polyA);
  const boxB = computePointsBoundingBox(polyB);

  const disjoint =
    boxA.maxX < boxB.minX - LEN_TOL ||
    boxA.minX > boxB.maxX + LEN_TOL ||
    boxA.maxY < boxB.minY - LEN_TOL ||
    boxA.minY > boxB.maxY + LEN_TOL;

  if (disjoint) {
    globalIntersectionTelemetry.disjointExits++;
    return [];
  }

  const loopA = ensureCCW(polyA);
  const loopB = ensureCCW(polyB);
  const nA = loopA.length;
  const nB = loopB.length;

  // 2. Full containment early exits
  let aInB = true;
  for (let i = 0; i < nA; i++) {
    if (!isPointInPolygon(loopA[i], loopB, SNAP_TOL)) {
      aInB = false;
      break;
    }
  }
  if (aInB) {
    globalIntersectionTelemetry.containmentAExits++;
    globalIntersectionTelemetry.fastPathSuccess++;
    return [loopA];
  }

  let bInA = true;
  for (let j = 0; j < nB; j++) {
    if (!isPointInPolygon(loopB[j], loopA, SNAP_TOL)) {
      bInA = false;
      break;
    }
  }
  if (bInA) {
    globalIntersectionTelemetry.containmentBExits++;
    globalIntersectionTelemetry.fastPathSuccess++;
    return [loopB];
  }

  // 3. Segment Subdivision & Integer-Keyed VertexPool
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

    const splitsA: number[][] = Array.from({ length: nA }, () => [0, 1]);
    const splitsB: number[][] = Array.from({ length: nB }, () => [0, 1]);

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

    // Classify Subsegments for Intersection (A ∩ B):
    // Keep A segments where inside B; keep B segments where inside A.
    // Shared co-directional edges are kept once. Contra-directional cancel out.
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
          // Shared co-directional edge on boundary of both polygons -> keep once on A's side
          keptSegments.push(segA);
        } else {
          // Touching interface with opposite orientation -> 0-area line, cancel both
          continue;
        }
      } else {
        if (
          midA.x >= boxB.minX - AABB_SLOP &&
          midA.x <= boxB.maxX + AABB_SLOP &&
          midA.y >= boxB.minY - AABB_SLOP &&
          midA.y <= boxB.maxY + AABB_SLOP &&
          isPointInPolygon(midA, loopB, SNAP_TOL)
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
        isPointInPolygon(midB, loopA, SNAP_TOL)
      ) {
        keptSegments.push(segB);
      }
    }

    if (keptSegments.length === 0) {
      globalIntersectionTelemetry.disjointExits++;
      globalIntersectionTelemetry.fastPathSuccess++;
      return [];
    }

    if (keptSegments.length < 3) {
      globalIntersectionTelemetry.insufficientSegmentsExits++;
      throw new Error('Insufficient kept segments for intersection');
    }

    // Assemble closed loops from directed segments using Forward-Star Flat Graph
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
          loops.push(ensureCCW(cleaned));
        }
      }
    }

    if (loops.length > 0) {
      globalIntersectionTelemetry.fastPathSuccess++;
      return loops;
    } else {
      globalIntersectionTelemetry.emptyLoopsExits++;
      throw new Error('No valid loops assembled');
    }
  } catch {
    globalIntersectionTelemetry.caughtExceptionExits++;
    globalIntersectionTelemetry.fallbackCalls++;
    return fallbackFn(polyA, polyB);
  }
}
