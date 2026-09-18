/**
 * Delaunay 2D Triangulation — szybka triangulacja Delone dla chmury punktów 2D.
 *
 * Zaimplementowana w oparciu o algorytm Bowyer-Watson / Sweep z zabezpieczeniem numerycznym.
 * Zwraca płaski bufor indeksów trójkątów (Uint32Array: [i0, i1, i2, i3, i4, i5, ...]).
 */

export interface Point2DLike {
  x: number;
  y: number;
}

export function triangulateDelaunay2D(points: Point2DLike[]): Uint32Array {
  const n = points.length;
  if (n < 3) return new Uint32Array(0);
  if (n === 3) return new Uint32Array([0, 1, 2]);

  // 1. Wyznacz bounding box
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const deltaMax = Math.max(dx, dy);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // 2. Utwórz super-trójkąt obejmujący wszystkie punkty
  const st0: Point2DLike = { x: midX - 20 * deltaMax, y: midY - deltaMax };
  const st1: Point2DLike = { x: midX, y: midY + 20 * deltaMax };
  const st2: Point2DLike = { x: midX + 20 * deltaMax, y: midY - deltaMax };

  const allPoints: Point2DLike[] = [...points, st0, st1, st2];
  const stIndices = [n, n + 1, n + 2];

  // Tablica aktywnych trójkątów: każdy trójkąt to [i0, i1, i2]
  let triangles: number[][] = [[stIndices[0], stIndices[1], stIndices[2]]];

  // 3. Wstawiaj punkty iteracyjnie (Bowyer-Watson)
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const polygonEdges: Array<[number, number]> = [];
    const remainingTriangles: number[][] = [];

    for (let t = 0; t < triangles.length; t++) {
      const tri = triangles[t];
      const p0 = allPoints[tri[0]];
      const p1 = allPoints[tri[1]];
      const p2 = allPoints[tri[2]];

      if (inCircumcircle(p.x, p.y, p0.x, p0.y, p1.x, p1.y, p2.x, p2.y)) {
        // Dodaj krawędzie do bufora polygonu
        polygonEdges.push([tri[0], tri[1]]);
        polygonEdges.push([tri[1], tri[2]]);
        polygonEdges.push([tri[2], tri[0]]);
      } else {
        remainingTriangles.push(tri);
      }
    }

    // Usuń zduplikowane krawędzie (współdzielone przez sąsiednie trójkąty w jamie)
    const uniqueEdges: Array<[number, number]> = [];
    for (let e = 0; e < polygonEdges.length; e++) {
      const [e0, e1] = polygonEdges[e];
      let isDuplicate = false;
      for (let j = 0; j < polygonEdges.length; j++) {
        if (e === j) continue;
        const [j0, j1] = polygonEdges[j];
        if ((e0 === j0 && e1 === j1) || (e0 === j1 && e1 === j0)) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        uniqueEdges.push([e0, e1]);
      }
    }

    // Utwórz nowe trójkąty łączące punkt i z unikalnymi krawędziami
    for (let e = 0; e < uniqueEdges.length; e++) {
      remainingTriangles.push([uniqueEdges[e][0], uniqueEdges[e][1], i]);
    }

    triangles = remainingTriangles;
  }

  // 4. Usuń trójkąty zawierające wierzchołki super-trójkąta
  const resultIndices: number[] = [];
  for (let t = 0; t < triangles.length; t++) {
    const tri = triangles[t];
    if (tri[0] < n && tri[1] < n && tri[2] < n) {
      resultIndices.push(tri[0], tri[1], tri[2]);
    }
  }

  return new Uint32Array(resultIndices);
}

/**
 * Sprawdza czy punkt (px, py) leży wewnątrz okręgu opisanego na trójkącie (ax, ay), (bx, by), (cx, cy).
 */
function inCircumcircle(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): boolean {
  const dx = ax - px;
  const dy = ay - py;
  const ex = bx - px;
  const ey = by - py;
  const fx = cx - px;
  const fy = cy - py;

  const ab = (ax * ax - px * px) + (ay * ay - py * py);
  const cd = (bx * bx - px * px) + (by * by - py * py);
  const ef = (cx * cx - px * px) + (cy * cy - py * py);

  const det = (dx * (ey * (fx * fx + fy * fy) - fy * (ex * ex + ey * ey)))
            - (dy * (ex * (fx * fx + fy * fy) - fx * (ex * ex + ey * ey)))
            + ((dx * dx + dy * dy) * (ex * fy - ey * fx));

  // Zorientowany wyznacznik
  const ccw = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return ccw > 0 ? det > 1e-10 : det < -1e-10;
}
