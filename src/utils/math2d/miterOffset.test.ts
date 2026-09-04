import { describe, it, expect } from 'vitest';
import { miterOffsetPolygon } from './miterOffset';
import { Point2D } from '../../types/geometry';

describe('miterOffsetPolygon', () => {
  it('correctly offsets a CCW 10x10 square inward (-2m)', () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const offset = miterOffsetPolygon(square, -2);
    expect(offset.length).toBe(4);
    expect(offset[0].x).toBeCloseTo(2, 2);
    expect(offset[0].y).toBeCloseTo(2, 2);
    expect(offset[1].x).toBeCloseTo(8, 2);
    expect(offset[1].y).toBeCloseTo(2, 2);
    expect(offset[2].x).toBeCloseTo(8, 2);
    expect(offset[2].y).toBeCloseTo(8, 2);
    expect(offset[3].x).toBeCloseTo(2, 2);
    expect(offset[3].y).toBeCloseTo(8, 2);
  });

  it('correctly offsets a CCW 10x10 square outward (+1.5m)', () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const offset = miterOffsetPolygon(square, 1.5);
    expect(offset.length).toBe(4);
    expect(offset[0].x).toBeCloseTo(-1.5, 2);
    expect(offset[0].y).toBeCloseTo(-1.5, 2);
    expect(offset[1].x).toBeCloseTo(11.5, 2);
    expect(offset[1].y).toBeCloseTo(-1.5, 2);
    expect(offset[2].x).toBeCloseTo(11.5, 2);
    expect(offset[2].y).toBeCloseTo(11.5, 2);
    expect(offset[3].x).toBeCloseTo(-1.5, 2);
    expect(offset[3].y).toBeCloseTo(11.5, 2);
  });

  it('returns clone if distance is 0', () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const offset = miterOffsetPolygon(square, 0);
    expect(offset).toEqual(square);
  });
});
