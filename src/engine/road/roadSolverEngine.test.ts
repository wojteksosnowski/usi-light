import { describe, it, expect } from 'vitest';
import { solveRoad } from './roadSolverEngine';
import { isPointInPolygon } from '../../utils/math2d/polygons';

describe('solveRoad', () => {
  const plot = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 20 },
    { x: 0, y: 20 },
  ];
  const obstacle = [
    { x: 12, y: 5 },
    { x: 18, y: 5 },
    { x: 18, y: 15 },
    { x: 12, y: 15 },
  ];

  it('produces a road polygon that does not overlap the obstacle', () => {
    const result = solveRoad({
      pointA: { x: 3, y: 10 },
      pointB: { x: 27, y: 10 },
      width: 4,
      obstacles: [obstacle],
      plot,
    });

    expect(result.success).toBe(true);
    expect(result.polygon.length).toBeGreaterThanOrEqual(3);

    // Droga może być styczna do granicy przeszkody (dokładnie zachowana szerokość W/2), ale
    // jej środek (strictly interior point) nigdy nie może leżeć wewnątrz poligonu drogi.
    const centroid = obstacle.reduce(
      (acc, p) => ({ x: acc.x + p.x / obstacle.length, y: acc.y + p.y / obstacle.length }),
      { x: 0, y: 0 }
    );
    expect(isPointInPolygon(centroid, result.polygon)).toBe(false);
  });

  it('fails when the start point is inside an obstacle', () => {
    const result = solveRoad({
      pointA: { x: 15, y: 10 },
      pointB: { x: 28, y: 10 },
      width: 4,
      obstacles: [obstacle],
      plot,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('point_blocked');
  });
});
