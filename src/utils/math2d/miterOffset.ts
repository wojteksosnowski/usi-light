import { Point2D } from '../../types/geometry';
import { calculateSignedArea, isPolygonCCW } from './polygons';

export interface MiterOffsetOptions {
  miterLimit?: number; // Maksymalny współczynnik wydłużenia narożnika (domyślnie 3.0)
  minArea?: number;    // Minimalne pole powierzchni po offsetcie (domyślnie 0.5 m²)
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

  // Obliczamy wektory normalne zewnętrzne dla każdej krawędzi i -> (i+1)%n
  const edgeNormals: { x: number; y: number; len: number }[] = [];

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

  // Walidacja wyniku: sprawdzenie czy pole powierzchni nie zapadło się
  const origArea = Math.abs(calculateSignedArea(vertices));
  const newArea = calculateSignedArea(result);
  const newAbsArea = Math.abs(newArea);

  // Jeśli wielokąt odwrócił orientację lub pole jest zbyt małe, zwracamy fallback
  const orientationKept = isCCW ? newArea > 0 : newArea < 0;
  if (!orientationKept || newAbsArea < minArea || (distance < 0 && newAbsArea > origArea)) {
    // Wielokąt zapadł się w sobie (np. zbyt duże cofnięcie) – zwracamy ostatni poprawny stan lub pusty/oryginalny
    return vertices.map((p) => ({ ...p }));
  }

  return result;
}
