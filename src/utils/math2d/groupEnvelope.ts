import { Point2D, BuildingLoop } from '../../types/geometry';
import { offsetPolygonWithJoin } from './miterOffset';
import { unionPolygonLoops } from './polygons';

/**
 * Oblicza dynamiczną obwiednię grupy połączonych obiektów logicznych (Node / Compound).
 * 1. Wykonuje zaokrąglony bufor (offset) wokół każdego obiektu z grupy.
 * 2. Scala wygenerowane obrysy zoptymalizowaną sumą boolowską (fast union).
 *
 * @param groupBuildings Lista obiektów wchodzących w skład grupy
 * @param offsetDistance Odległość odsunięcia obwiedni w metrach (domyślnie 1.0m)
 * @returns Lista pętli wielokątów tworzących wynikową obwiednię grupy
 */
export function computeGroupEnvelope(
  groupBuildings: BuildingLoop[],
  offsetDistance: number = 1.0
): Point2D[][] {
  if (!groupBuildings || groupBuildings.length === 0) return [];

  const validBuildings = groupBuildings.filter(
    (b) => b && Array.isArray(b.vertices) && b.vertices.length >= 3
  );
  if (validBuildings.length === 0) return [];

  const bufferedLoops: Point2D[][] = [];

  for (const bldg of validBuildings) {
    const offsetRes = offsetPolygonWithJoin(bldg.vertices, offsetDistance, 'round', {
      minArea: 0.2,
      miterLimit: 2.5,
    });
    if (offsetRes && offsetRes.length > 0) {
      for (const loop of offsetRes) {
        if (loop && loop.length >= 3) {
          bufferedLoops.push(loop);
        }
      }
    } else {
      bufferedLoops.push(bldg.vertices);
    }
  }

  if (bufferedLoops.length === 0) return [];
  if (bufferedLoops.length === 1) return bufferedLoops;

  return unionPolygonLoops(bufferedLoops);
}
