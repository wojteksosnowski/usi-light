import { Point2D } from '../../types/geometry';

/**
 * Buduje segment prowadnicy wyśrodkowany na `origin`, rozciągnięty symetrycznie w obie strony
 * wzdłuż jednostkowego kierunku `dir` o połowie długości `halfLen`:
 *   p1 = origin - halfLen * dir,  p2 = origin + halfLen * dir
 * Konsoliduje wzorzec powtórzony w DirectionSnapStrategy.ts (kierunek jako {cos, sin} kąta)
 * i w objectDragSnap.ts (kierunek jako wektor jednostkowy krawędzi {uX, uY}).
 */
export function buildCenteredGuideline(origin: Point2D, dir: Point2D, halfLen: number): { p1: Point2D; p2: Point2D } {
  return {
    p1: { x: origin.x - halfLen * dir.x, y: origin.y - halfLen * dir.y },
    p2: { x: origin.x + halfLen * dir.x, y: origin.y + halfLen * dir.y },
  };
}

/**
 * Buduje segment prowadnicy rozciągający rzeczywistą krawędź (edgeP1..edgeP2) o `extLen` w obie
 * strony wzdłuż jej jednostkowego kierunku `dir` (p1 cofnięty przed edgeP1, p2 wysunięty za
 * edgeP2). Konsoliduje wzorzec powtórzony w objectDragSnap.ts (evaluateCollinearAndParallelLock,
 * evaluateEdgeDragSnap) i w EdgeSnapStrategy.ts (prowadnica dla typu 'extension').
 */
export function buildExtendedGuideline(
  edgeP1: Point2D,
  edgeP2: Point2D,
  dir: Point2D,
  extLen: number
): { p1: Point2D; p2: Point2D } {
  return {
    p1: { x: edgeP1.x - extLen * dir.x, y: edgeP1.y - extLen * dir.y },
    p2: { x: edgeP2.x + extLen * dir.x, y: edgeP2.y + extLen * dir.y },
  };
}
