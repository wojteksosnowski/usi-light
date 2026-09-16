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
    if (len1Sq < 1e-12) continue; // duplicate vertex

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2Sq = dx2 * dx2 + dy2 * dy2;
    if (len2Sq < 1e-12) continue;

    const cross = dx1 * dy2 - dy1 * dx2;
    const dot = dx1 * dx2 + dy1 * dy2;
    // Strictly collinear and in the same forward direction
    if (Math.abs(cross) < 1e-10 && dot > 0) {
      continue;
    }
    res.push(curr);
  }
  return res.length >= 3 ? res : points;
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
}

let globalTelemetry: FastUnionTelemetry = {
  totalCalls: 0,
  disjointExits: 0,
  containmentExits: 0,
  fastPathSuccess: 0,
  fallbackCalls: 0,
};

export function resetFastUnionTelemetry(): void {
  globalTelemetry = {
    totalCalls: 0,
    disjointExits: 0,
    containmentExits: 0,
    fastPathSuccess: 0,
    fallbackCalls: 0,
  };
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
    boxA.maxX < boxB.minX - EPSILON ||
    boxA.minX > boxB.maxX + EPSILON ||
    boxA.maxY < boxB.minY - EPSILON ||
    boxA.minY > boxB.maxY + EPSILON;

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
    if (!isPointInPolygon(loopA[i], loopB)) {
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
    if (!isPointInPolygon(loopB[j], loopA)) {
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
    const SNAP_TOL_SQ = 1e-8; // 1e-4 distance

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

    for (let i = 0; i < nA; i++) {
      const a1 = loopA[i];
      const a2 = loopA[(i + 1) % nA];
      const dx1 = a2.x - a1.x;
      const dy1 = a2.y - a1.y;
      const len1Sq = dx1 * dx1 + dy1 * dy1;
      if (len1Sq < 1e-12) continue;

      const aMinX = dx1 > 0 ? a1.x : a2.x;
      const aMaxX = dx1 > 0 ? a2.x : a1.x;
      const aMinY = dy1 > 0 ? a1.y : a2.y;
      const aMaxY = dy1 > 0 ? a2.y : a1.y;

      for (let j = 0; j < nB; j++) {
        const b1 = loopB[j];
        const b2 = loopB[(j + 1) % nB];
        const dx2 = b2.x - b1.x;
        const dy2 = b2.y - b1.y;
        const len2Sq = dx2 * dx2 + dy2 * dy2;
        if (len2Sq < 1e-12) continue;

        const bMinX = dx2 > 0 ? b1.x : b2.x;
        const bMaxX = dx2 > 0 ? b2.x : b1.x;
        if (aMaxX < bMinX - 1e-4 || aMinX > bMaxX + 1e-4) continue;

        const bMinY = dy2 > 0 ? b1.y : b2.y;
        const bMaxY = dy2 > 0 ? b2.y : b1.y;
        if (aMaxY < bMinY - 1e-4 || aMinY > bMaxY + 1e-4) continue;

        const denom = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denom) < 1e-10) {
          // Collinear test: check if b1 or b2 lie on segment a1->a2
          const cross1 = (b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1;
          if (Math.abs(cross1) / Math.sqrt(len1Sq) < 1e-4) {
            const t_b1 = ((b1.x - a1.x) * dx1 + (b1.y - a1.y) * dy1) / len1Sq;
            const t_b2 = ((b2.x - a1.x) * dx1 + (b2.y - a1.y) * dy1) / len1Sq;
            if (t_b1 > 1e-5 && t_b1 < 1 - 1e-5) splitsA[i].push(t_b1);
            if (t_b2 > 1e-5 && t_b2 < 1 - 1e-5) splitsA[i].push(t_b2);

            const u_a1 = ((a1.x - b1.x) * dx2 + (a1.y - b1.y) * dy2) / len2Sq;
            const u_a2 = ((a2.x - b1.x) * dx2 + (a2.y - b1.y) * dy2) / len2Sq;
            if (u_a1 > 1e-5 && u_a1 < 1 - 1e-5) splitsB[j].push(u_a1);
            if (u_a2 > 1e-5 && u_a2 < 1 - 1e-5) splitsB[j].push(u_a2);
          }
          continue;
        }

        const qx = b1.x - a1.x;
        const qy = b1.y - a1.y;
        const t = (qx * dy2 - qy * dx2) / denom;
        const u = (qx * dy1 - qy * dx1) / denom;

        if (t >= -1e-5 && t <= 1 + 1e-5 && u >= -1e-5 && u <= 1 + 1e-5) {
          const clampedT = Math.max(0, Math.min(1, t));
          const clampedU = Math.max(0, Math.min(1, u));
          if (clampedT > 1e-5 && clampedT < 1 - 1e-5) splitsA[i].push(clampedT);
          if (clampedU > 1e-5 && clampedU < 1 - 1e-5) splitsB[j].push(clampedU);
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
        if (tEnd - tStart < 1e-6) continue;
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
        if (tEnd - tStart < 1e-6) continue;
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
          midA.x < boxB.minX - 1e-4 ||
          midA.x > boxB.maxX + 1e-4 ||
          midA.y < boxB.minY - 1e-4 ||
          midA.y > boxB.maxY + 1e-4 ||
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
        midB.x < boxA.minX - 1e-4 ||
        midB.x > boxA.maxX + 1e-4 ||
        midB.y < boxA.minY - 1e-4 ||
        midB.y > boxA.maxY + 1e-4 ||
        !isPointInPolygon(midB, loopA)
      ) {
        keptSegments.push(segB);
      }
    }

    if (keptSegments.length < 3) {
      throw new Error('Insufficient kept segments');
    }

    // D. Assemble closed loops from directed segments
    interface GraphEdge {
      u: number;
      v: number;
      p1: Point2D;
      p2: Point2D;
      visited: boolean;
    }

    const graphEdges: GraphEdge[] = keptSegments.map((s) => ({
      u: s.u,
      v: s.v,
      p1: s.p1,
      p2: s.p2,
      visited: false,
    }));

    const outMap = new Map<number, GraphEdge[]>();
    for (const ge of graphEdges) {
      let list = outMap.get(ge.u);
      if (!list) {
        list = [];
        outMap.set(ge.u, list);
      }
      list.push(ge);
    }

    const loops: Point2D[][] = [];
    const loopAbsAreas: number[] = [];
    const maxSteps = graphEdges.length * 4 + 10;

    for (const startEdge of graphEdges) {
      if (startEdge.visited) continue;

      const currentLoop: Point2D[] = [];
      let currEdge: GraphEdge | null = startEdge;
      const startU = startEdge.u;
      let steps = 0;

      while (currEdge && !currEdge.visited && steps++ < maxSteps) {
        currEdge.visited = true;
        currentLoop.push(currEdge.p1);

        const nextU = currEdge.v;
        if (nextU === startU) {
          break;
        }

        const candidates = outMap.get(nextU)?.filter((e) => !e.visited);
        if (!candidates || candidates.length === 0) {
          currEdge = null;
          break;
        }

        if (candidates.length === 1) {
          currEdge = candidates[0];
        } else {
          // Multiple outgoing choices (touch point): pick outermost turn
          const prevDir = {
            x: currEdge.p2.x - currEdge.p1.x,
            y: currEdge.p2.y - currEdge.p1.y,
          };
          const prevAngle = Math.atan2(prevDir.y, prevDir.x);

          let bestEdge = candidates[0];
          let minAngleDiff = Infinity;

          for (const cand of candidates) {
            const nextDir = {
              x: cand.p2.x - cand.p1.x,
              y: cand.p2.y - cand.p1.y,
            };
            const nextAngle = Math.atan2(nextDir.y, nextDir.x);
            let diff = nextAngle - prevAngle;
            while (diff <= -Math.PI) diff += 2 * Math.PI;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            if (diff < minAngleDiff) {
              minAngleDiff = diff;
              bestEdge = cand;
            }
          }
          currEdge = bestEdge;
        }
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
        if (isPointInPolygon(loop[0], outer)) {
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
    }
  } catch {
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
