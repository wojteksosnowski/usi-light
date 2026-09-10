import { describe, it, expect } from 'vitest';
import { findShortestPath } from './pathfind';
import { VisibilityGraph } from './visibilityGraph';

function graphFromEdges(nodes: { x: number; y: number }[], edgeList: [number, number, number][]): VisibilityGraph {
  const edges = new Map<number, Map<number, number>>();
  nodes.forEach((_, i) => edges.set(i, new Map()));
  for (const [a, b, w] of edgeList) {
    edges.get(a)!.set(b, w);
    edges.get(b)!.set(a, w);
  }
  return { nodes, edges };
}

describe('findShortestPath', () => {
  it('picks the lower-weight route among two alternatives', () => {
    const nodes = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, { x: 5, y: -5 }];
    // 0-2-1 costs 14.14..., 0-3-1 costs 14.14... too, tie; make 0-3-1 cheaper explicitly
    const graph = graphFromEdges(nodes, [
      [0, 2, 10],
      [2, 1, 10],
      [0, 3, 3],
      [3, 1, 3],
    ]);
    const path = findShortestPath(graph, 0, 1);
    expect(path).toEqual([nodes[0], nodes[3], nodes[1]]);
  });

  it('returns null when start and end are disconnected', () => {
    const nodes = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const graph = graphFromEdges(nodes, []);
    const path = findShortestPath(graph, 0, 1);
    expect(path).toBeNull();
  });
});
