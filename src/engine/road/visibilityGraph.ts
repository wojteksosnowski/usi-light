import { Point2D } from '../../types/geometry';
import { isSegmentClear } from './obstacleZone';
import { isPointInPolygon } from '../../utils/math2d/polygons';

export interface VisibilityGraph {
  nodes: Point2D[];
  edges: Map<number, Map<number, number>>; // adjacency: nodeIndex -> (neighborIndex -> weight)
}

/**
 * Buduje graf widoczności: węzły to punkt A, punkt B oraz wierzchołki dylatowanych przeszkód
 * (zarówno adaptacyjne pod R_min, jak i bazowe W/2); krawędź istnieje między dwoma węzłami,
 * gdy łączący je odcinek nie przecina żadnej przeszkody W/2 i pozostaje w obrębie działki.
 */
export function buildVisibilityGraph(
  pointA: Point2D,
  pointB: Point2D,
  dilatedObstacles: Point2D[][],
  plotInset?: Point2D[] | null,
  roadDilatedObstacles?: Point2D[][]
): VisibilityGraph {
  const nodes: Point2D[] = [pointA, pointB];
  const seen = new Set<string>();
  const addNode = (p: Point2D) => {
    if (plotInset && plotInset.length >= 3 && !isPointInPolygon(p, plotInset)) return false;
    const key = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    if (!seen.has(key)) {
      seen.add(key);
      nodes.push(p);
    }
    return true;
  };

  seen.add(`${pointA.x.toFixed(3)},${pointA.y.toFixed(3)}`);
  seen.add(`${pointB.x.toFixed(3)},${pointB.y.toFixed(3)}`);

  const primaryObstacles = roadDilatedObstacles && roadDilatedObstacles.length > 0 ? roadDilatedObstacles : dilatedObstacles;

  for (let oIdx = 0; oIdx < primaryObstacles.length; oIdx++) {
    const obstacle = primaryObstacles[oIdx];
    const fallbackObs = dilatedObstacles[oIdx];
    for (let vIdx = 0; vIdx < obstacle.length; vIdx++) {
      const vertex = obstacle[vIdx];
      const added = addNode(vertex);
      // Jeśli wierzchołek R_min wypadł poza działkę, dodajemy jako fallback wierzchołek W/2
      if (!added && fallbackObs && vIdx < fallbackObs.length) {
        addNode(fallbackObs[vIdx]);
      }
    }
  }

  const n = nodes.length;
  const edges = new Map<number, Map<number, number>>();
  for (let i = 0; i < n; i++) edges.set(i, new Map());

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (isSegmentClear(a, b, dilatedObstacles, plotInset)) {
        const weight = Math.hypot(b.x - a.x, b.y - a.y);
        edges.get(i)!.set(j, weight);
        edges.get(j)!.set(i, weight);
      }
    }
  }

  return { nodes, edges };
}
