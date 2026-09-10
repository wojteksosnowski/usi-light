import { Point2D } from '../../types/geometry';
import polygonClipping from 'polygon-clipping';

export type SweepAlignment = 'center' | 'left' | 'right';

export interface SweepOptions {
  miterLimit?: number; // Maksymalny współczynnik wydłużenia narożnika (domyślnie 3.0)
}

/**
 * Generuje wielokąt (zamkniętą wstęgę) wokół otwartej polilinii o zadanej szerokości i wyrównaniu.
 * 
 * @param polyline Wierzchołki otwartej polilinii bazowej (min. 2 punkty)
 * @param width Szerokość wstęgi w metrach (> 0)
 * @param alignment Sposób odsunięcia: 'center' (oś), 'left' (po stronie normalnej), 'right' (przeciwna do normalnej)
 * @param options Opcje (np. miterLimit)
 * @returns Zamknięta lista wierzchołków wielokąta
 */
export function generateSweepPolygon(
  polyline: Point2D[],
  width: number,
  alignment: SweepAlignment = 'center',
  options: SweepOptions = {}
): Point2D[] {
  if (!polyline || polyline.length < 2) {
    return [];
  }

  const effectiveWidth = Math.max(0.01, Number.isFinite(width) ? width : 1.0);
  const miterLimit = options.miterLimit ?? 3.0;

  // Filtrujemy zduplikowane sąsiednie punkty
  const pts: Point2D[] = [polyline[0]];
  for (let i = 1; i < polyline.length; i++) {
    const prev = pts[pts.length - 1];
    const curr = polyline[i];
    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > 1e-4) {
      pts.push(curr);
    }
  }

  if (pts.length < 2) {
    return [];
  }

  const n = pts.length;
  const numSegs = n - 1;

  // Obliczenie wektorów normalnych lewostronnych dla każdego odcinka: n = (-dy/L, dx/L)
  const normals: { x: number; y: number }[] = [];
  for (let i = 0; i < numSegs; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1e-6;
    normals.push({
      x: -dy / len,
      y: dx / len,
    });
  }

  // Wartości odsunięć wzdłuż wektora normalnego
  let dLeft = 0;
  let dRight = 0;

  switch (alignment) {
    case 'left':
      dLeft = effectiveWidth;
      dRight = 0;
      break;
    case 'right':
      dLeft = 0;
      dRight = -effectiveWidth;
      break;
    case 'center':
    default:
      dLeft = effectiveWidth / 2;
      dRight = -effectiveWidth / 2;
      break;
  }

  const leftPoints: Point2D[] = [];
  const rightPoints: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      // Początek polilinii
      const n0 = normals[0];
      leftPoints.push({
        x: pts[0].x + dLeft * n0.x,
        y: pts[0].y + dLeft * n0.y,
      });
      rightPoints.push({
        x: pts[0].x + dRight * n0.x,
        y: pts[0].y + dRight * n0.y,
      });
    } else if (i === n - 1) {
      // Koniec polilinii
      const nLast = normals[numSegs - 1];
      leftPoints.push({
        x: pts[n - 1].x + dLeft * nLast.x,
        y: pts[n - 1].y + dLeft * nLast.y,
      });
      rightPoints.push({
        x: pts[n - 1].x + dRight * nLast.x,
        y: pts[n - 1].y + dRight * nLast.y,
      });
    } else {
      // Wierzchołek wewnętrzny: przecięcie miter pomiędzy normals[i-1] a normals[i]
      const nPrev = normals[i - 1];
      const nCurr = normals[i];
      const vi = pts[i];

      const cosTheta = nPrev.x * nCurr.x + nPrev.y * nCurr.y;
      const denom = 1 + cosTheta;

      // Obliczenie lewego wierzchołka
      if (Math.abs(dLeft) < 1e-6) {
        leftPoints.push({ x: vi.x, y: vi.y });
      } else if (denom > 1e-4) {
        const factor = dLeft / denom;
        const vx = factor * (nPrev.x + nCurr.x);
        const vy = factor * (nPrev.y + nCurr.y);
        const vLen = Math.hypot(vx, vy);
        const maxDist = Math.abs(dLeft) * miterLimit;

        if (vLen > maxDist && vLen > 1e-6) {
          const scale = maxDist / vLen;
          leftPoints.push({ x: vi.x + vx * scale, y: vi.y + vy * scale });
        } else {
          leftPoints.push({ x: vi.x + vx, y: vi.y + vy });
        }
      } else {
        // Narożnik zawraca o 180°
        leftPoints.push({ x: vi.x + dLeft * nCurr.x, y: vi.y + dLeft * nCurr.y });
      }

      // Obliczenie prawego wierzchołka
      if (Math.abs(dRight) < 1e-6) {
        rightPoints.push({ x: vi.x, y: vi.y });
      } else if (denom > 1e-4) {
        const factor = dRight / denom;
        const vx = factor * (nPrev.x + nCurr.x);
        const vy = factor * (nPrev.y + nCurr.y);
        const vLen = Math.hypot(vx, vy);
        const maxDist = Math.abs(dRight) * miterLimit;

        if (vLen > maxDist && vLen > 1e-6) {
          const scale = maxDist / vLen;
          rightPoints.push({ x: vi.x + vx * scale, y: vi.y + vy * scale });
        } else {
          rightPoints.push({ x: vi.x + vx, y: vi.y + vy });
        }
      } else {
        rightPoints.push({ x: vi.x + dRight * nCurr.x, y: vi.y + dRight * nCurr.y });
      }
    }
  }

  // Zamknięty obrys: lewa ścieżka (0 -> n-1), a następnie prawa ścieżka wspak (n-1 -> 0)
  const result: Point2D[] = [...leftPoints];
  for (let i = rightPoints.length - 1; i >= 0; i--) {
    result.push(rightPoints[i]);
  }

  return hasSelfIntersection(result) ? repairSelfIntersectingRibbon(result) : result;
}

/** Wykrywa, czy jakiekolwiek dwie niesąsiadujące krawędzi zamkniętego wielokąta się przecinają. */
export function hasSelfIntersectionForTest(points: Point2D[]): boolean {
  return hasSelfIntersection(points);
}

function hasSelfIntersection(points: Point2D[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsIntersect(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): boolean {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return false;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  const eps = 1e-9;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

/**
 * Naprawia samoprzecinający się obrys wstęgi (np. przy ostrych zakrętach polilinii bazowej,
 * gdzie naiwny miter-offset lewej/prawej krawędzi tworzy pętlę typu bowtie).
 *
 * Wykorzystuje sztuczkę z polygon-clipping: unia samoprzecinającego się pierścienia sama ze
 * sobą rozdziela go na zbiór prostych (nie-samoprzecinających) wielokątów wg reguły non-zero.
 * Dla poprawnego (nie-samoprzecinającego się) wejścia to no-op — zwraca wejście niezmienione.
 * Zwracamy pojedynczą pętlę o największym polu (dominujący obrys wstęgi); drobne odcięte
 * fragmenty przy pinch-poincie zakrętu są odrzucane jako artefakt offsetu, nie realny kształt drogi.
 */
function repairSelfIntersectingRibbon(points: Point2D[]): Point2D[] {
  if (points.length < 4) return points;

  const ring: [number, number][] = points.map((p) => [p.x, p.y]);
  ring.push([points[0].x, points[0].y]);

  let unionResult: polygonClipping.MultiPolygon;
  try {
    unionResult = polygonClipping.union([ring]);
  } catch {
    return points;
  }

  if (!unionResult || unionResult.length === 0) return points;
  if (unionResult.length === 1 && unionResult[0].length === 1) {
    // Pojedyncza pętla bez otworów — brak samoprzecięcia (lub naprawa nic nie zmieniła topologicznie).
    const ringOut = unionResult[0][0];
    const isClosed =
      ringOut.length > 1 &&
      ringOut[0][0] === ringOut[ringOut.length - 1][0] &&
      ringOut[0][1] === ringOut[ringOut.length - 1][1];
    const pts = (isClosed ? ringOut.slice(0, -1) : ringOut).map(([x, y]) => ({ x, y }));
    return pts.length >= 3 ? pts : points;
  }

  // Wiele rozłącznych wielokątów — samoprzecięcie rozdzieliło wstęgę. Wybieramy zewnętrzny
  // pierścień o największym polu jako dominujący obrys.
  let best: Point2D[] | null = null;
  let bestArea = -Infinity;
  for (const poly of unionResult) {
    const outer = poly[0];
    if (!outer || outer.length < 4) continue;
    const isClosed = outer[0][0] === outer[outer.length - 1][0] && outer[0][1] === outer[outer.length - 1][1];
    const pts = (isClosed ? outer.slice(0, -1) : outer).map(([x, y]) => ({ x, y }));
    if (pts.length < 3) continue;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      area += a.x * b.y - b.x * a.y;
    }
    area = Math.abs(area) / 2;
    if (area > bestArea) {
      bestArea = area;
      best = pts;
    }
  }

  return best && best.length >= 3 ? best : points;
}

/**
 * Przesuwa pojedynczy odcinek otwartej polilinii (np. osi Wstęgi) równolegle do samego siebie,
 * wyznaczając nowe punkty końcowe jako geometryczne przecięcia z prostymi sąsiednich odcinków.
 * 
 * FUNDAMENTALNA ZASADA:
 * Żaden sąsiedni odcinek nie zmienia swojego kąta/kierunku nachylenia.
 * Przesuwana krawędź przemieszcza się wyłącznie wzdłuż swojej normalnej.
 *
 * @param polyline Wierzchołki otwartej polilinii (min. 2 punkty)
 * @param edgeIndex Indeks przesuwanej krawędzi (odcinek polyline[edgeIndex] -> polyline[edgeIndex+1])
 * @param delta Wektor przesunięcia { x, y }
 */
export function offsetOpenPolylineEdge(
  polyline: Point2D[],
  edgeIndex: number,
  delta: Point2D
): Point2D[] {
  const n = polyline.length;
  if (n < 2 || edgeIndex < 0 || edgeIndex >= n - 1) {
    return polyline;
  }

  const p1 = polyline[edgeIndex];
  const p2 = polyline[edgeIndex + 1];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return polyline;

  // Normalna lewostronna do odcinka: (-dy/len, dx/len)
  const nx = -dy / len;
  const ny = dx / len;

  // Rzut wektora myszy na normalną odcinka (przemieszczenie czysto prostopadłe)
  const d = delta.x * nx + delta.y * ny;
  if (Math.abs(d) < 1e-6) return polyline;

  const result = polyline.map((p) => ({ ...p }));

  // 1. Wyznaczenie nowego punktu początkowego odcinka (newP1)
  if (edgeIndex > 0) {
    // Poprzedni odcinek p0 -> p1
    const p0 = polyline[edgeIndex - 1];
    const d0x = p1.x - p0.x;
    const d0y = p1.y - p0.y;

    // Przesunięta prosta odcinka edgeIndex: punkt (p1 + d*n), kierunek (dx, dy)
    // Prosta poprzedniego odcinka: punkt p0, kierunek (d0x, d0y)
    const det = d0x * dy - d0y * dx;
    if (Math.abs(det) > 1e-5) {
      // Przecięcie dwóch prostych
      const shiftedP1x = p1.x + d * nx;
      const shiftedP1y = p1.y + d * ny;
      const t = ((shiftedP1x - p0.x) * dy - (shiftedP1y - p0.y) * dx) / det;
      result[edgeIndex] = {
        x: p0.x + t * d0x,
        y: p0.y + t * d0y,
      };
    } else {
      // Odcinki są równoległe/współliniowe
      result[edgeIndex] = {
        x: p1.x + d * nx,
        y: p1.y + d * ny,
      };
    }
  } else {
    // Pierwszy wierzchołek polilinii: przesunięcie czysto równoległe
    result[0] = {
      x: p1.x + d * nx,
      y: p1.y + d * ny,
    };
  }

  // 2. Wyznaczenie nowego punktu końcowego odcinka (newP2)
  if (edgeIndex + 1 < n - 1) {
    // Następny odcinek p2 -> p3
    const p3 = polyline[edgeIndex + 2];
    const d2x = p3.x - p2.x;
    const d2y = p3.y - p2.y;

    // Przesunięta prosta odcinka edgeIndex: punkt (p2 + d*n), kierunek (dx, dy)
    // Prosta następnego odcinka: punkt p3, kierunek (d2x, d2y)
    const det = dx * d2y - dy * d2x;
    if (Math.abs(det) > 1e-5) {
      const shiftedP2x = p2.x + d * nx;
      const shiftedP2y = p2.y + d * ny;
      const t = ((p3.x - shiftedP2x) * d2y - (p3.y - shiftedP2y) * d2x) / det;
      result[edgeIndex + 1] = {
        x: shiftedP2x + t * dx,
        y: shiftedP2y + t * dy,
      };
    } else {
      // Odcinki są równoległe/współliniowe
      result[edgeIndex + 1] = {
        x: p2.x + d * nx,
        y: p2.y + d * ny,
      };
    }
  } else {
    // Ostatni wierzchołek polilinii: przesunięcie czysto równoległe
    result[n - 1] = {
      x: p2.x + d * nx,
      y: p2.y + d * ny,
    };
  }

  return result;
}

