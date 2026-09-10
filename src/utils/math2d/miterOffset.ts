import { Point2D } from '../../types/geometry';
import { calculateSignedArea } from './polygons';
import { MiterOffsetOptions, PolygonJoinType, offsetPolygonRobust } from './offsetPolygon';

export type { MiterOffsetOptions, PolygonJoinType };

/** Z listy pętli wynikowych wybiera tę o największym |polu| — dla wywołujących, którzy
 * historycznie zakładają jeden wynikowy pierścień (patrz offsetPolygonRobust w offsetPolygon.ts
 * dla pełnej, wielo-wyspowej wersji tego samego, kuloodpornego algorytmu). */
function pickLargestLoop(loops: Point2D[][], fallback: Point2D[]): Point2D[] {
  if (loops.length === 0) return fallback.map((p) => ({ ...p }));
  let best = loops[0];
  let bestArea = Math.abs(calculateSignedArea(best));
  for (let i = 1; i < loops.length; i++) {
    const area = Math.abs(calculateSignedArea(loops[i]));
    if (area > bestArea) {
      best = loops[i];
      bestArea = area;
    }
  }
  return best;
}

/**
 * Wyznacza offset 2D wielokąta wzdłuż dwusiecznych krawędzi (miter offset).
 * @param vertices Wierzchołki wielokąta bazowego
 * @param distance Odległość offsetu w metrach (>0 powiększenie na zewnątrz, <0 pomniejszenie do wewnątrz)
 * @param options Opcje (miterLimit, minArea)
 * @returns Nowe wierzchołki przesuniętego wielokąta (pętla o największym polu, jeśli erozja
 * rozcięła wielokąt na wyspy) lub oryginalne wierzchołki, jeśli offset całkowicie się zapadł.
 */
export function miterOffsetPolygon(
  vertices: Point2D[],
  distance: number,
  options: MiterOffsetOptions = {}
): Point2D[] {
  if (!vertices || vertices.length < 3 || Math.abs(distance) < 1e-5) {
    return vertices ? vertices.map((p) => ({ ...p })) : [];
  }
  return pickLargestLoop(offsetPolygonRobust(vertices, distance, 'miter', options), vertices);
}

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
  return pickLargestLoop(offsetPolygonRobust(vertices, distance, joinType, options), vertices);
}
