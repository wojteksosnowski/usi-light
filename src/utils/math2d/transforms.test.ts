import { describe, it, expect } from 'vitest';
import { offsetPolygonEdge, adjustEdgeLength } from './transforms';
import { Point2D } from '../../types/geometry';

describe('transforms - offsetPolygonEdge', () => {
  it('offsets top edge of a square rectangle upwards', () => {
    // CCW square: (0,0) -> (10,0) -> (10,10) -> (0,10)
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    // Edge 2 is from (10,10) to (0,10) with outward normal (0, 1)
    const shifted = offsetPolygonEdge(square, 2, { x: 0, y: 5 });

    expect(shifted[2]).toEqual({ x: 10, y: 15 });
    expect(shifted[3]).toEqual({ x: 0, y: 15 });
    expect(shifted[0]).toEqual({ x: 0, y: 0 });
    expect(shifted[1]).toEqual({ x: 10, y: 0 });
  });

  it('preserves geometry when delta has zero component along edge normal', () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    // Moving parallel to edge 2 (along X) produces zero normal displacement
    const unchanged = offsetPolygonEdge(square, 2, { x: 5, y: 0 });
    expect(unchanged).toEqual(square);
  });
});
