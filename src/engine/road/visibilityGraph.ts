import { Point2D } from '../../types/geometry';
import { isSegmentClear } from './obstacleZone';

export interface VisibilityGraph {
  nodes: Point2D[];
  edges: Map<number, Map<number, number>>; // adjacency: nodeIndex -> (neighborIndex -> weight)
}

/**
 * Buduje graf widoczności: węzły to punkt A, punkt B oraz wszystkie wierzchołki dylatowanych
 * przeszkód; krawędź istnieje między dwoma węzłami, gdy łączący je odcinek nie przecina
 * żadnej przeszkody i pozostaje w obrębie insetowanej działki (gdy podana).
 */
export function buildVisibilityGraph(
  pointA: Point2D,
  pointB: Point2D,
  dilatedObstacles: Point2D[][],
  plotInset?: Point2D[] | null
): VisibilityGraph {
  const nodes: Point2D[] = [pointA, pointB];
  for (const obstacle of dilatedObstacles) {
    for (const vertex of obstacle) {
      nodes.push(vertex);
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
