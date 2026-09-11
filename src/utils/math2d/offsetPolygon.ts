import { Point2D } from '../../types/geometry';
import { calculateSignedArea, isPolygonCCW, unionPolygonLoops } from './polygons';

export interface MiterOffsetOptions {
  miterLimit?: number; // Maksymalny współczynnik wydłużenia narożnika (domyślnie 3.0)
  minArea?: number;    // Minimalne pole powierzchni pętli wynikowej (domyślnie 0.5 m²)
}

export type PolygonJoinType = 'miter' | 'round' | 'bevel';

interface EdgeNormal {
  x: number;
  y: number;
  len: number;
}

const ROUND_JOIN_ARC_SEGMENTS = 8;

/** Oblicza wektory normalne zewnętrzne dla każdej krawędzi i -> (i+1)%n wielokąta. */
function computeEdgeNormals(vertices: Point2D[], isCCW: boolean): EdgeNormal[] {
  const n = vertices.length;
  const edgeNormals: EdgeNormal[] = [];

  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);

    if (len < 1e-7) {
      edgeNormals.push({ x: 0, y: 0, len: 0 });
      continue;
    }

    const nx = isCCW ? dy / len : -dy / len;
    const ny = isCCW ? -dx / len : dx / len;
    edgeNormals.push({ x: nx, y: ny, len });
  }

  return edgeNormals;
}

/** Krok 1 (miter): naiwny offset per-wierzchołek przez przecięcie przesuniętych prostych
 * sąsiednich krawędzi — dokładnie ta sama matematyka co historyczny `miterOffsetPolygon`,
 * ale bez walidacji/fallbacku — surowy wynik może się samo-przecinać, to normalne. */
function buildRawMiterRing(vertices: Point2D[], distance: number, miterLimit: number, isCCW: boolean): Point2D[] {
  const n = vertices.length;
  const edgeNormals = computeEdgeNormals(vertices, isCCW);
  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const nextIdx = i;
    const n1 = edgeNormals[prevIdx];
    const n2 = edgeNormals[nextIdx];
    const vi = vertices[i];

    if (n1.len < 1e-7 && n2.len < 1e-7) {
      result.push({ ...vi });
      continue;
    }

    const norm1 = n1.len < 1e-7 ? n2 : n1;
    const norm2 = n2.len < 1e-7 ? n1 : n2;

    const c1 = norm1.x * vi.x + norm1.y * vi.y + distance;
    const c2 = norm2.x * vi.x + norm2.y * vi.y + distance;
    const det = norm1.x * norm2.y - norm1.y * norm2.x;

    if (Math.abs(det) < 1e-5) {
      result.push({ x: vi.x + distance * norm1.x, y: vi.y + distance * norm1.y });
      continue;
    }

    const px = (c1 * norm2.y - c2 * norm1.y) / det;
    const py = (norm1.x * c2 - norm2.x * c1) / det;

    const offsetDist = Math.hypot(px - vi.x, py - vi.y);
    const maxDist = Math.abs(distance) * miterLimit;

    if (offsetDist > maxDist && maxDist > 0) {
      const bisectX = norm1.x + norm2.x;
      const bisectY = norm1.y + norm2.y;
      const bisectLen = Math.hypot(bisectX, bisectY);
      if (bisectLen > 1e-5) {
        const dir = distance >= 0 ? 1 : -1;
        result.push({ x: vi.x + (dir * maxDist * bisectX) / bisectLen, y: vi.y + (dir * maxDist * bisectY) / bisectLen });
      } else {
        result.push({ x: px, y: py });
      }
    } else {
      result.push({ x: px, y: py });
    }
  }

  return result;
}

/** Krok 1 (round/bevel): naiwny offset per-wierzchołek z zaokrąglonym lub ściętym narożnikiem. */
function buildRawJoinRing(vertices: Point2D[], distance: number, joinType: 'round' | 'bevel', isCCW: boolean): Point2D[] {
  const n = vertices.length;
  const edgeNormals = computeEdgeNormals(vertices, isCCW);
  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const nextIdx = i;
    const n1 = edgeNormals[prevIdx];
    const n2 = edgeNormals[nextIdx];
    const vi = vertices[i];

    if (n1.len < 1e-7 && n2.len < 1e-7) {
      result.push({ ...vi });
      continue;
    }

    const norm1 = n1.len < 1e-7 ? n2 : n1;
    const norm2 = n2.len < 1e-7 ? n1 : n2;

    const p1 = { x: vi.x + distance * norm1.x, y: vi.y + distance * norm1.y };
    const p2 = { x: vi.x + distance * norm2.x, y: vi.y + distance * norm2.y };

    const cross = norm1.x * norm2.y - norm1.y * norm2.x;
    const dot = norm1.x * norm2.x + norm1.y * norm2.y;
    if (Math.abs(cross) < 1e-5 && dot > 0) {
      result.push(p1);
      continue;
    }

    if (joinType === 'bevel') {
      result.push(p1, p2);
    } else {
      const a1 = Math.atan2(norm1.y, norm1.x);
      const a2 = Math.atan2(norm2.y, norm2.x);
      let delta = a2 - a1;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      if ((delta > 0) !== (cross > 0) && Math.abs(delta) > 1e-6) {
        delta = delta > 0 ? delta - 2 * Math.PI : delta + 2 * Math.PI;
      }
      const steps = Math.max(1, Math.round((Math.abs(delta) / (Math.PI / 2)) * ROUND_JOIN_ARC_SEGMENTS));
      const r = Math.abs(distance);
      for (let s = 0; s <= steps; s++) {
        const a = a1 + (delta * s) / steps;
        result.push({ x: vi.x + r * Math.cos(a), y: vi.y + r * Math.sin(a) });
      }
    }
  }

  return result;
}

/**
 * Uniwersalny, kuloodporny offset wielokąta — dylatacja (`distance > 0`) lub erozja
 * (`distance < 0`) o zadaną odległość, ze stylem naroża 'miter'|'round'|'bevel'.
 */
export function offsetPolygonRobust(
  vertices: Point2D[],
  distance: number,
  joinType: PolygonJoinType = 'miter',
  options: MiterOffsetOptions = {}
): Point2D[][] {
  if (!vertices || vertices.length < 3) return [];
  if (Math.abs(distance) < 1e-5) return [vertices.map((p) => ({ ...p }))];

  const { miterLimit = 3.0, minArea = 0.5 } = options;
  const isCCW = isPolygonCCW(vertices);

  const rawRing =
    joinType === 'miter'
      ? buildRawMiterRing(vertices, distance, miterLimit, isCCW)
      : buildRawJoinRing(vertices, distance, joinType, isCCW);

  if (rawRing.length < 3) return [];

  let cleanedLoops: Point2D[][];
  try {
    cleanedLoops = unionPolygonLoops([rawRing, rawRing]);
  } catch {
    cleanedLoops = [rawRing];
  }

  const origArea = Math.abs(calculateSignedArea(vertices));

  return cleanedLoops.filter((loop) => {
    if (loop.length < 3) return false;
    const area = Math.abs(calculateSignedArea(loop));
    if (area < minArea) return false;
    if (distance < 0 && area > origArea + minArea) return false;
    return true;
  });
}

/**
 * Buduje surowy pierścień miter z adaptacyjnym odsunięciem wypukłych narożników dla zadanego promienia R_min.
 */
function buildRoadMiterRing(
  vertices: Point2D[],
  distance: number,
  minTurnRadius: number,
  isCCW: boolean
): Point2D[] {
  const n = vertices.length;
  const edgeNormals = computeEdgeNormals(vertices, isCCW);
  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const nextIdx = i;
    const n1 = edgeNormals[prevIdx];
    const n2 = edgeNormals[nextIdx];
    const vi = vertices[i];

    if (n1.len < 1e-7 && n2.len < 1e-7) {
      result.push({ ...vi });
      continue;
    }

    const norm1 = n1.len < 1e-7 ? n2 : n1;
    const norm2 = n2.len < 1e-7 ? n1 : n2;

    const cross = norm1.x * norm2.y - norm1.y * norm2.x;
    const isConvex = isCCW ? cross > 1e-5 : cross < -1e-5;

    const c1 = norm1.x * vi.x + norm1.y * vi.y + distance;
    const c2 = norm2.x * vi.x + norm2.y * vi.y + distance;
    const det = norm1.x * norm2.y - norm1.y * norm2.x;

    if (Math.abs(det) < 1e-5) {
      result.push({ x: vi.x + distance * norm1.x, y: vi.y + distance * norm1.y });
      continue;
    }

    const px = (c1 * norm2.y - c2 * norm1.y) / det;
    const py = (norm1.x * c2 - norm2.x * c1) / det;

    if (isConvex && minTurnRadius > distance) {
      const bisectX = norm1.x + norm2.x;
      const bisectY = norm1.y + norm2.y;
      const bisectLen = Math.hypot(bisectX, bisectY);
      if (bisectLen > 1e-5) {
        const sinHalfTheta = Math.max(0.1, bisectLen / 2);
        const requiredDist = (minTurnRadius / sinHalfTheta) - minTurnRadius + distance;
        const clampedDist = Math.min(requiredDist, Math.max(distance * 4.0, minTurnRadius * 4.0));
        result.push({
          x: vi.x + (clampedDist * bisectX) / bisectLen,
          y: vi.y + (clampedDist * bisectY) / bisectLen,
        });
        continue;
      }
    }

    result.push({ x: px, y: py });
  }

  return result;
}

/**
 * Dylatuje przeszkody pod trasowanie drogi z uwzględnieniem minimalnego promienia skrętu R_min.
 * Odsunięcie wypukłych narożników o O(theta, R_min, W/2) gwarantuje, że wpisany łuk o pełnym
 * promieniu R_min nie zetnie narożnika i zachowa odległość >= W/2 od przeszkody.
 */
export function offsetPolygonForRoad(
  vertices: Point2D[],
  distance: number,
  minTurnRadius: number,
  options: MiterOffsetOptions = {}
): Point2D[][] {
  if (!vertices || vertices.length < 3) return [];
  if (Math.abs(distance) < 1e-5) return [vertices.map((p) => ({ ...p }))];

  const { minArea = 0.5 } = options;
  const isCCW = isPolygonCCW(vertices);
  const rawRing = buildRoadMiterRing(vertices, distance, minTurnRadius, isCCW);

  if (rawRing.length < 3) return [];

  let cleanedLoops: Point2D[][];
  try {
    cleanedLoops = unionPolygonLoops([rawRing, rawRing]);
  } catch {
    cleanedLoops = [rawRing];
  }

  return cleanedLoops.filter((loop) => {
    if (loop.length < 3) return false;
    const area = Math.abs(calculateSignedArea(loop));
    return area >= minArea;
  });
}

