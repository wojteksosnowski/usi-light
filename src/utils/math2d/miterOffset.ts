import { Point2D } from '../../types/geometry';
import { calculateSignedArea, isPolygonCCW } from './polygons';

export interface MiterOffsetOptions {
  miterLimit?: number; // Maksymalny współczynnik wydłużenia narożnika (domyślnie 3.0)
  minArea?: number;    // Minimalne pole powierzchni po offsetcie (domyślnie 0.5 m²)
}

interface EdgeNormal {
  x: number;
  y: number;
  len: number;
}

/**
 * Oblicza wektory normalne zewnętrzne dla każdej krawędzi i -> (i+1)%n wielokąta.
 */
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

    // Dla CCW: normalna zewnętrzna w prawo od kierunku wektora to (dy/L, -dx/L)
    // Dla CW:  normalna zewnętrzna w lewo to (-dy/L, dx/L)
    const nx = isCCW ? dy / len : -dy / len;
    const ny = isCCW ? -dx / len : dx / len;
    edgeNormals.push({ x: nx, y: ny, len });
  }

  return edgeNormals;
}

/**
 * Sprawdza czy wynik offsetu nie zapadł się (zachowana orientacja, pole powyżej minimum).
 * Zwraca `result`, lub oryginalne wierzchołki (kopię) jeśli walidacja nie przejdzie.
 */
function validateOffsetResult(
  vertices: Point2D[],
  result: Point2D[],
  isCCW: boolean,
  distance: number,
  minArea: number
): Point2D[] {
  const origArea = Math.abs(calculateSignedArea(vertices));
  const newArea = calculateSignedArea(result);
  const newAbsArea = Math.abs(newArea);

  const orientationKept = isCCW ? newArea > 0 : newArea < 0;
  if (!orientationKept || newAbsArea < minArea || (distance < 0 && newAbsArea > origArea)) {
    // Wielokąt zapadł się w sobie (np. zbyt duże cofnięcie) – zwracamy oryginalne wierzchołki
    return vertices.map((p) => ({ ...p }));
  }

  return result;
}

/**
 * Wyznacza offset 2D wielokąta wzdłuż dwusiecznych krawędzi (miter offset).
 * @param vertices Wierzchołki wielokąta bazowego
 * @param distance Odległość offsetu w metrach (>0 powiększenie na zewnątrz, <0 pomniejszenie do wewnątrz)
 * @param options Opcje (miterLimit, minArea)
 * @returns Nowe wierzchołki przesuniętego wielokąta lub oryginalne wierzchołki, jeśli offset zapada wielokąt
 */
export function miterOffsetPolygon(
  vertices: Point2D[],
  distance: number,
  options: MiterOffsetOptions = {}
): Point2D[] {
  if (!vertices || vertices.length < 3 || Math.abs(distance) < 1e-5) {
    return vertices ? vertices.map((p) => ({ ...p })) : [];
  }

  const { miterLimit = 3.0, minArea = 0.5 } = options;

  // Sprawdzamy orientację wielokąta – normalizujemy wektory do standardu CCW
  const isCCW = isPolygonCCW(vertices);
  const n = vertices.length;
  const edgeNormals = computeEdgeNormals(vertices, isCCW);

  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const nextIdx = i;

    const n1 = edgeNormals[prevIdx];
    const n2 = edgeNormals[nextIdx];

    const vi = vertices[i];

    // Jeśli krawędzie są zdegenerowane, używamy bezpośredniego przesunięcia
    if (n1.len < 1e-7 && n2.len < 1e-7) {
      result.push({ ...vi });
      continue;
    }

    const norm1 = n1.len < 1e-7 ? n2 : n1;
    const norm2 = n2.len < 1e-7 ? n1 : n2;

    // Równania prostych przesuniętych krawędzi:
    // norm1.x * x + norm1.y * y = C1
    // norm2.x * x + norm2.y * y = C2
    const c1 = norm1.x * vi.x + norm1.y * vi.y + distance;
    const c2 = norm2.x * vi.x + norm2.y * vi.y + distance;

    const det = norm1.x * norm2.y - norm1.y * norm2.x;

    if (Math.abs(det) < 1e-5) {
      // Krawędzie prawie równoległe/współliniowe
      result.push({
        x: vi.x + distance * norm1.x,
        y: vi.y + distance * norm1.y,
      });
    } else {
      // Przecięcie prostych offsetu
      const px = (c1 * norm2.y - c2 * norm1.y) / det;
      const py = (norm1.x * c2 - norm2.x * c1) / det;

      // Sprawdzenie miter limitu
      const offsetDist = Math.hypot(px - vi.x, py - vi.y);
      const maxDist = Math.abs(distance) * miterLimit;

      if (offsetDist > maxDist && maxDist > 0) {
        // Obcięcie do bisectora z limitem długości
        const bisectX = norm1.x + norm2.x;
        const bisectY = norm1.y + norm2.y;
        const bisectLen = Math.hypot(bisectX, bisectY);
        if (bisectLen > 1e-5) {
          const dir = distance >= 0 ? 1 : -1;
          result.push({
            x: vi.x + (dir * maxDist * bisectX) / bisectLen,
            y: vi.y + (dir * maxDist * bisectY) / bisectLen,
          });
        } else {
          result.push({ x: px, y: py });
        }
      } else {
        result.push({ x: px, y: py });
      }
    }
  }

  return validateOffsetResult(vertices, result, isCCW, distance, minArea);
}

export type PolygonJoinType = 'miter' | 'round' | 'bevel';

const ROUND_JOIN_ARC_SEGMENTS = 8;

/**
 * Wyznacza offset 2D wielokąta z wyborem stylu naroża (miter / round / bevel).
 * @param vertices Wierzchołki wielokąta bazowego
 * @param distance Odległość offsetu w metrach (>0 na zewnątrz, <0 do wewnątrz)
 * @param joinType Styl naroża: 'miter' (proste, ostre), 'round' (zaokrąglone, promień = |distance|), 'bevel' (ścięte)
 * @param options Opcje (miterLimit, minArea) — używane tylko dla 'miter'
 */
export function offsetPolygonWithJoin(
  vertices: Point2D[],
  distance: number,
  joinType: PolygonJoinType,
  options: MiterOffsetOptions = {}
): Point2D[] {
  if (!vertices || vertices.length < 3 || Math.abs(distance) < 1e-5) {
    return vertices ? vertices.map((p) => ({ ...p })) : [];
  }

  if (joinType === 'miter') {
    return miterOffsetPolygon(vertices, distance, options);
  }

  const { minArea = 0.5 } = options;
  const isCCW = isPolygonCCW(vertices);
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

    // Krawędzie prawie równoległe/współliniowe: brak naroża do wygenerowania
    const cross = norm1.x * norm2.y - norm1.y * norm2.x;
    const dot = norm1.x * norm2.x + norm1.y * norm2.y;
    if (Math.abs(cross) < 1e-5 && dot > 0) {
      result.push(p1);
      continue;
    }

    if (joinType === 'bevel') {
      result.push(p1, p2);
    } else {
      // round: łuk o promieniu |distance| wyśrodkowany na oryginalnym wierzchołku,
      // interpolowany od kierunku norm1 do norm2 (krótszą drogą zgodną ze skrętem naroża).
      const a1 = Math.atan2(norm1.y, norm1.x);
      const a2 = Math.atan2(norm2.y, norm2.x);
      let delta = a2 - a1;
      // Normalizacja do (-PI, PI], a następnie dopasowanie kierunku skrętu do znaku 'cross'
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

  return validateOffsetResult(vertices, result, isCCW, distance, minArea);
}
