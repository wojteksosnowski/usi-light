import { Point2D } from '../../types/geometry';
import { VisibilityGraph } from './visibilityGraph';

/**
 * Wyznacza najkrótszą ścieżkę pomiędzy dwoma węzłami grafu widoczności algorytmem Dijkstry.
 * Zwraca listę punktów (włącznie ze startem i celem) lub null, gdy brak połączenia.
 */
export function findShortestPath(
  graph: VisibilityGraph,
  startIdx: number,
  endIdx: number
): Point2D[] | null {
  const { nodes, edges } = graph;
  const n = nodes.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const visited = new Array<boolean>(n).fill(false);

  dist[startIdx] = 0;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1) break;
    if (u === endIdx) break;
    visited[u] = true;

    const neighbors = edges.get(u);
    if (!neighbors) continue;
    for (const [v, weight] of neighbors) {
      if (visited[v]) continue;
      const alt = dist[u] + weight;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }

  if (dist[endIdx] === Infinity) return null;

  const path: Point2D[] = [];
  let curr = endIdx;
  while (curr !== -1) {
    path.push(nodes[curr]);
    curr = prev[curr];
  }
  path.reverse();
  return path;
}
