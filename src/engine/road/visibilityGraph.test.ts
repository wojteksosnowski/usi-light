import { describe, it, expect } from 'vitest';
import { buildVisibilityGraph } from './visibilityGraph';
import { findShortestPath } from './pathfind';
import { dilateObstacles } from './obstacleZone';

describe('buildVisibilityGraph + findShortestPath', () => {
  it('routes around a single rectangular obstacle between A and B', () => {
    const pointA = { x: 0, y: 10 };
    const pointB = { x: 20, y: 10 };
    const obstacle = [
      { x: 8, y: 5 },
      { x: 12, y: 5 },
      { x: 12, y: 15 },
      { x: 8, y: 15 },
    ];
    const dilated = dilateObstacles([obstacle], 0.5);

    const graph = buildVisibilityGraph(pointA, pointB, dilated, null);
    const path = findShortestPath(graph, 0, 1);

    expect(path).not.toBeNull();
    expect(path![0]).toEqual(pointA);
    expect(path![path!.length - 1]).toEqual(pointB);
    // Ścieżka musi mieć co najmniej jeden pośredni węzeł (obejście przeszkody)
    expect(path!.length).toBeGreaterThan(2);
  });

  it('returns a direct A-B edge when no obstacle blocks the path', () => {
    const pointA = { x: 0, y: 0 };
    const pointB = { x: 10, y: 0 };
    const graph = buildVisibilityGraph(pointA, pointB, [], null);
    const path = findShortestPath(graph, 0, 1);

    expect(path).toEqual([pointA, pointB]);
  });
});
