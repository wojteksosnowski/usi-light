import { Point2D, BuildingLoop } from '../types/geometry';

export interface CachedLineEquation {
  id: string; // np. `${objectId}_edge_${index}`
  objectId: string;
  edgeIndex: number;
  p1: Point2D;
  p2: Point2D;
  length: number;
  // Znormalizowana postać ogólna Ax + By + C = 0 (wektor normalny n = [A, B], A^2 + B^2 = 1)
  A: number;
  B: number;
  C: number;
  uX: number; // wektor jednostkowy kierunkowy ux
  uY: number; // wektor jednostkowy kierunkowy uy
  angle: number; // kąt w radianach [0, PI) znormalizowany pod kątem równoległości
}

/**
 * Normalizuje kąt w radianach do przedziału [0, PI)
 */
export function normalizeAnglePi(angleRad: number): number {
  let a = angleRad % Math.PI;
  if (a < 0) a += Math.PI;
  return a;
}

/**
 * Tworzy znormalizowany wpis bufora dla odcinka P1 -> P2
 */
export function createCachedLineEquation(
  id: string,
  objectId: string,
  edgeIndex: number,
  p1: Point2D,
  p2: Point2D
): CachedLineEquation {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);

  if (length < 1e-7) {
    return {
      id,
      objectId,
      edgeIndex,
      p1: { ...p1 },
      p2: { ...p2 },
      length: 0,
      A: 0,
      B: 1,
      C: -p1.y,
      uX: 1,
      uY: 0,
      angle: 0,
    };
  }

  const uX = dx / length;
  const uY = dy / length;

  // Normalna zewnętrzna (A, B) prostopadła do u = (uX, uY): (-uY, uX)
  const A = -dy / length;
  const B = dx / length;
  const C = -(A * p1.x + B * p1.y);

  // Kąt kierunkowy odcinka w [0, PI)
  const rawAngle = Math.atan2(dy, dx);
  const angle = normalizeAnglePi(rawAngle);

  return {
    id,
    objectId,
    edgeIndex,
    p1: { ...p1 },
    p2: { ...p2 },
    length,
    A,
    B,
    C,
    uX,
    uY,
    angle,
  };
}

/**
 * Tworzy bufor linii dla wierzchołków pojedynczego obiektu / poligonu
 */
export function buildLineBufferForPolygon(
  objectId: string,
  vertices: Point2D[]
): CachedLineEquation[] {
  const buffer: CachedLineEquation[] = [];
  const n = vertices.length;
  if (n < 2) return buffer;

  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];
    buffer.push(createCachedLineEquation(`${objectId}_edge_${i}`, objectId, i, p1, p2));
  }
  return buffer;
}

/**
 * Tworzy pełny bufor linii dla wszystkich aktywnych budynków
 */
export function buildLineBufferFromBuildings(
  buildings: BuildingLoop[],
  layerSettings: Record<string, { isVisible?: boolean; isGhosted?: boolean; isLocked?: boolean }> = {}
): Map<string, CachedLineEquation[]> {
  const lineBufferMap = new Map<string, CachedLineEquation[]>();

  for (const bldg of buildings) {
    if (bldg.isIncluded === false) continue;
    const lyr = bldg.layer || 'Domyślna (0)';
    if (layerSettings[lyr]?.isVisible === false) continue;

    if (bldg.vertices && bldg.vertices.length >= 2) {
      lineBufferMap.set(bldg.id, buildLineBufferForPolygon(bldg.id, bldg.vertices));
    }
  }

  return lineBufferMap;
}

/**
 * Spłaszcza mapę bufora linii do pojedynczej tablicy
 */
export function flattenLineBuffer(bufferMap: Map<string, CachedLineEquation[]>): CachedLineEquation[] {
  const all: CachedLineEquation[] = [];
  for (const list of bufferMap.values()) {
    for (const item of list) {
      all.push(item);
    }
  }
  return all;
}

/**
 * Aktualizacja bufora obiektu przy translacji (dx, dy) w czasie O(1) na krawędź
 * Współczynniki A i B nie ulegają zmianie. C_new = C - (A*dx + B*dy)
 */
export function translateLineBuffer(
  buffer: CachedLineEquation[],
  dx: number,
  dy: number
): CachedLineEquation[] {
  return buffer.map((line) => ({
    ...line,
    p1: { x: line.p1.x + dx, y: line.p1.y + dy },
    p2: { x: line.p2.x + dx, y: line.p2.y + dy },
    C: line.C - (line.A * dx + line.B * dy),
  }));
}

/**
 * Aktualizacja bufora obiektu przy rotacji wokół punktu pivot w czasie O(1) na krawędź
 */
export function rotateLineBuffer(
  buffer: CachedLineEquation[],
  pivot: Point2D,
  deltaAlphaRad: number
): CachedLineEquation[] {
  const cosA = Math.cos(deltaAlphaRad);
  const sinA = Math.sin(deltaAlphaRad);

  return buffer.map((line) => {
    // Rotacja punktów p1 i p2
    const p1dx = line.p1.x - pivot.x;
    const p1dy = line.p1.y - pivot.y;
    const p1Rot: Point2D = {
      x: pivot.x + (p1dx * cosA - p1dy * sinA),
      y: pivot.y + (p1dx * sinA + p1dy * cosA),
    };

    const p2dx = line.p2.x - pivot.x;
    const p2dy = line.p2.y - pivot.y;
    const p2Rot: Point2D = {
      x: pivot.x + (p2dx * cosA - p2dy * sinA),
      y: pivot.y + (p2dx * sinA + p2dy * cosA),
    };

    // Rotacja wektora normalnego [A, B]^T
    const Anew = cosA * line.A - sinA * line.B;
    const Bnew = sinA * line.A + cosA * line.B;
    const Cnew = -(Anew * p1Rot.x + Bnew * p1Rot.y);

    // Rotacja wektora kierunkowego u
    const uXnew = cosA * line.uX - sinA * line.uY;
    const uYnew = sinA * line.uX + cosA * line.uY;
    const angleNew = normalizeAnglePi(line.angle + deltaAlphaRad);

    return {
      ...line,
      p1: p1Rot,
      p2: p2Rot,
      A: Anew,
      B: Bnew,
      C: Cnew,
      uX: uXnew,
      uY: uYnew,
      angle: angleNew,
    };
  });
}

/**
 * Inwalidacja i aktualizacja wyłącznie krawędzi (k-1) oraz k po modyfikacji wierzchołka Vk
 */
export function updateVertexInLineBuffer(
  buffer: CachedLineEquation[],
  objectId: string,
  vertices: Point2D[],
  k: number
): CachedLineEquation[] {
  const n = vertices.length;
  if (n < 2) return buildLineBufferForPolygon(objectId, vertices);

  const prevEdgeIdx = (k - 1 + n) % n;
  const currEdgeIdx = k % n;

  const newBuffer = [...buffer];

  // Krawędź k-1: V_{k-1} -> V_k
  newBuffer[prevEdgeIdx] = createCachedLineEquation(
    `${objectId}_edge_${prevEdgeIdx}`,
    objectId,
    prevEdgeIdx,
    vertices[prevEdgeIdx],
    vertices[k]
  );

  // Krawędź k: V_k -> V_{k+1}
  newBuffer[currEdgeIdx] = createCachedLineEquation(
    `${objectId}_edge_${currEdgeIdx}`,
    objectId,
    currEdgeIdx,
    vertices[k],
    vertices[(k + 1) % n]
  );

  return newBuffer;
}

/**
 * Oblicza odległość punktu M od nośnika prostej: d(M) = |A*Mx + B*My + C|
 */
export function distancePointToLine(point: Point2D, line: { A: number; B: number; C: number }): number {
  return Math.abs(line.A * point.x + line.B * point.y + line.C);
}

/**
 * Oblicza rzut prostopadły punktu M na prostą oraz parametr t wzdłuż wektora u
 */
export function projectPointToLine(
  point: Point2D,
  line: CachedLineEquation
): { projectedPoint: Point2D; t: number; isOnSegment: boolean; distance: number } {
  const signedDist = line.A * point.x + line.B * point.y + line.C;
  const projectedPoint: Point2D = {
    x: point.x - signedDist * line.A,
    y: point.y - signedDist * line.B,
  };

  const t = (point.x - line.p1.x) * line.uX + (point.y - line.p1.y) * line.uY;
  const isOnSegment = t >= -1e-5 && t <= line.length + 1e-5;

  return {
    projectedPoint,
    t,
    isOnSegment,
    distance: Math.abs(signedDist),
  };
}

/**
 * Wyznacza punkt przecięcia dwóch prostych A1*x + B1*y + C1 = 0 i A2*x + B2*y + C2 = 0
 * Używa wyznacznika Cramera: W = A1*B2 - A2*B1
 */
export function intersectLines(
  line1: { A: number; B: number; C: number },
  line2: { A: number; B: number; C: number },
  collinearEpsilon = 1e-5
): Point2D | null {
  const W = line1.A * line2.B - line2.A * line1.B;
  if (Math.abs(W) < collinearEpsilon) {
    return null; // Proste są równoległe lub współliniowe
  }

  const x = (line1.B * line2.C - line2.B * line1.C) / W;
  const y = (line1.C * line2.A - line2.C * line1.A) / W;

  return { x, y };
}

/**
 * Zwraca minimalną różnicę kątową pomiędzy dwoma kątami w radianach znormalizowanymi do [0, PI)
 */
export function angleDiffPi(angle1Rad: number, angle2Rad: number): number {
  const a1 = normalizeAnglePi(angle1Rad);
  const a2 = normalizeAnglePi(angle2Rad);
  const diff = Math.abs(a1 - a2);
  return Math.min(diff, Math.PI - diff);
}
