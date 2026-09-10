import { Point2D } from '../../types/geometry';
import { offsetPolygonWithJoin } from '../../utils/math2d/miterOffset';
import { offsetPolygonRobust } from '../../utils/math2d/offsetPolygon';
import { unionPolygonLoops, differencePolygonLoops, isPointInPolygon } from '../../utils/math2d/polygons';
import { segmentSegmentIntersectionParam } from '../../utils/math2d/segments';
import { pointsEqual } from '../../utils/math2d/vec2';

/**
 * Rozszerza (dylatuje) każdą przeszkodę o połowę szerokości drogi, tak by oś drogi
 * mogła bezpiecznie przebiegać po ich granicy z zachowaniem pełnej szerokości W.
 */
export function dilateObstacles(obstacles: Point2D[][], halfWidth: number): Point2D[][] {
  if (halfWidth <= 1e-6) return obstacles.map((o) => o.map((p) => ({ ...p })));
  // Uwaga: 'miter' (nie 'round') celowo — graf widoczności używa wierzchołków dylatowanej
  // przeszkody jako węzłów; przy stylu 'round' cięcie (chord) między dwoma punktami tego
  // samego łuku zawsze wpada do wnętrza okręgu, mimo że nie przecina żadnej krawędzi
  // transversalnie (wchodzi/wychodzi w wierzchołkach) — dawałoby to fałszywie "wolne" ścieżki.
  // flatMap (nie map): offsetPolygonRobust może rozdzielić dylatację skomplikowanej/niewypukłej
  // przeszkody na kilka niezależnych pętli — wszystkie trafiają do dalszej unii przeszkód.
  return obstacles.flatMap((o) => offsetPolygonRobust(o, halfWidth, 'miter'));
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
 * Sprawdza, czy odcinek a->b nie przecina żadnej z dylatowanych przeszkód
 * i (opcjonalnie) pozostaje w obrębie insetowanej działki.
 */
export function isSegmentClear(
  a: Point2D,
  b: Point2D,
  dilatedObstacles: Point2D[][],
  plotInset?: Point2D[] | null
): boolean {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  for (const obstacle of dilatedObstacles) {
    // Cięcie (chord) łączące dwa styczne punkty tego samego zaokrąglonego narożnika
    // przechodzi wewnątrz przeszkody bez transversalnego przecięcia żadnej krawędzi
    // (wchodzi/wychodzi dokładnie w wierzchołkach) — łapiemy ten przypadek testem środka.
    if (isPointInPolygon(mid, obstacle)) {
      return false;
    }
  }

  for (const obstacle of dilatedObstacles) {
    const n = obstacle.length;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const p1 = obstacle[i];
      const p2 = obstacle[(i + 1) % n];
      // Pomijamy krawędzie przeszkody dotykające a/b tym samym wierzchołkiem (styczność w węźle
      // grafu widoczności, nie kolizja) — inaczej każdy odcinek wychodzący z narożnika przeszkody
      // zostałby błędnie zablokowany przez własną krawędź.
      if (pointsEqual(a, p1) || pointsEqual(a, p2) || pointsEqual(b, p1) || pointsEqual(b, p2)) {
        continue;
      }
      if (segmentSegmentIntersectionParam(a, b, p1, p2) !== null) {
        return false;
      }
    }
  }

  if (plotInset && plotInset.length >= 3) {
    if (!isPointInPolygon(mid, plotInset)) {
      return false;
    }
  }

  return true;
}
