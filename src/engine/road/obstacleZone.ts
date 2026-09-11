import { Point2D } from '../../types/geometry';
import { offsetPolygonWithJoin } from '../../utils/math2d/miterOffset';
import { offsetPolygonRobust, offsetPolygonForRoad } from '../../utils/math2d/offsetPolygon';
import { unionPolygonLoops, differencePolygonLoops, isPointInPolygon } from '../../utils/math2d/polygons';
import { segmentSegmentIntersectionParam, distancePointToSegment } from '../../utils/math2d/segments';
import { pointsEqual } from '../../utils/math2d/vec2';

/**
 * Rozszerza (dylatuje) każdą przeszkodę o połowę szerokości drogi, tak by oś drogi
 * mogła bezpiecznie przebiegać po ich granicy z zachowaniem pełnej szerokości W.
 */
export function dilateObstacles(obstacles: Point2D[][], halfWidth: number): Point2D[][] {
  if (halfWidth <= 1e-6) return obstacles.map((o) => o.map((p) => ({ ...p })));
  return obstacles.flatMap((o) => offsetPolygonRobust(o, halfWidth, 'miter'));
}

/**
 * Dylatuje przeszkody z adaptacyjnym odsunięciem wypukłych narożników pod zadany promień R_min.
 */
export function dilateObstaclesForRoad(
  obstacles: Point2D[][],
  halfWidth: number,
  minTurnRadius: number = 0
): Point2D[][] {
  if (halfWidth <= 1e-6) return obstacles.map((o) => o.map((p) => ({ ...p })));
  const effectiveR = Math.max(halfWidth, minTurnRadius);
  return obstacles.flatMap((o) => offsetPolygonForRoad(o, halfWidth, effectiveR));
}

/**
 * Zmniejsza (offset do wewnątrz) poligon działki o połowę szerokości drogi.
 */
export function insetPlot(plot: Point2D[], halfWidth: number): Point2D[] {
  if (halfWidth <= 1e-6) return plot.map((p) => ({ ...p }));
  return offsetPolygonWithJoin(plot, -halfWidth, 'miter');
}

/**
 * Wyznacza dozwoloną strefę manewrową P_free = Działka_inset \ Union(Przeszkody_dilated).
 * Gdy działka nie jest podana, zwraca tylko połączone dylatowane przeszkody (do testów kolizji),
 * bez ograniczenia zewnętrznego.
 */
export function computeFreeZone(
  plot: Point2D[] | null,
  obstacles: Point2D[][],
  width: number
): Point2D[][] {
  const halfWidth = width / 2;
  const dilated = dilateObstacles(obstacles, halfWidth);
  const obstacleUnion = dilated.length > 0 ? unionPolygonLoops(dilated) : [];

  if (!plot || plot.length < 3) {
    return obstacleUnion;
  }

  const inset = insetPlot(plot, halfWidth);
  if (inset.length < 3) return [];
  if (obstacleUnion.length === 0) return [inset];

  return differencePolygonLoops([inset], obstacleUnion);
}

/**
 * Sprawdza, czy punkt leży ściśle we wnętrzu poligonu (poza pasem brzegowym o szerokości tolerance).
 * Zapobiega błędnemu odrzucaniu punktów środkowych leżących dokładnie na krawędzi poligonu.
 */
export function isPointStrictlyInsidePolygon(
  point: Point2D,
  vertices: Point2D[],
  tolerance: number = 1e-4
): boolean {
  if (!point || !vertices || vertices.length < 3) return false;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];
    if (distancePointToSegment(point, p1, p2) <= tolerance) {
      return false;
    }
  }
  return isPointInPolygon(point, vertices);
}

/**
 * Sprawdza, czy odcinek a->b nie przecina żadnej z dylatowanych przeszkód
 * i (opcjonalnie) pozostaje w obrębie insetowanej działki.
 */
export function isSegmentClear(
  a: Point2D,
  b: Point2D,
  dilatedObstacles: Point2D[][],
  plotInset?: Point2D[] | null
): boolean {
  for (const obstacle of dilatedObstacles) {
    if (obstacle.length < 3) continue;
    const SAMPLE_COUNT = 20;
    const n = obstacle.length;
    for (let s = 1; s < SAMPLE_COUNT; s++) {
      const t = s / SAMPLE_COUNT;
      const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (isPointInPolygon(pt, obstacle)) {
        let onBoundary = false;
        for (let i = 0; i < n; i++) {
          if (distancePointToSegment(pt, obstacle[i], obstacle[(i + 1) % n]) < 1e-4) {
            onBoundary = true;
            break;
          }
        }
        if (!onBoundary) {
          return false;
        }
      }
    }
  }

  for (const obstacle of dilatedObstacles) {
    const n = obstacle.length;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const p1 = obstacle[i];
      const p2 = obstacle[(i + 1) % n];
      // Pomijamy krawędzie przeszkody dotykające a/b tym samym wierzchołkiem (styczność w węźle
      // grafu widoczności, nie kolizja)
      if (pointsEqual(a, p1) || pointsEqual(a, p2) || pointsEqual(b, p1) || pointsEqual(b, p2)) {
        continue;
      }
      if (segmentSegmentIntersectionParam(a, b, p1, p2) !== null) {
        return false;
      }
    }
  }

  if (plotInset && plotInset.length >= 3) {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!isPointInPolygon(mid, plotInset)) {
      return false;
    }
  }

  return true;
}
