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

    const offset = miterOffsetPolygon(square, -2)[0];
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

    const offset = miterOffsetPolygon(square, 1.5)[0];
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
    expect(offset).toEqual([square]);
  });

  it('resolves a self-intersecting (bowtie) result from a deep inward offset on a concave notch into separate simple islands', () => {
    // "H"-ähnliche/uskokowa figura: głęboki wcięcie (notch) pośrodku dolnej krawędzi.
    // Duży offset do wewnątrz sprawia, że naiwny miter offset zawija kontur w miejscu wcięcia.
    const notched: Point2D[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 8 },
      { x: 6, y: 8 },
      { x: 6, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const offsetPolys = miterOffsetPolygon(notched, -1.5);
    expect(offsetPolys.length).toBeGreaterThan(1);
    for (const poly of offsetPolys) {
      expect(poly.length).toBeGreaterThanOrEqual(3);
    }
    // Suma pól wynikowych wysp musi być mniejsza od pola oryginału (offset do wewnątrz).
    const origArea = Math.abs(
      notched.reduce((acc, p, i) => {
        const q = notched[(i + 1) % notched.length];
        return acc + (p.x * q.y - q.x * p.y);
      }, 0) / 2
    );
    const totalOffsetArea = offsetPolys.reduce((acc, poly) => {
      return (
        acc +
        Math.abs(
          poly.reduce((a, p, i) => {
            const q = poly[(i + 1) % poly.length];
            return a + (p.x * q.y - q.x * p.y);
          }, 0) / 2
        )
      );
    }, 0);
    expect(totalOffsetArea).toBeLessThan(origArea);
    expect(totalOffsetArea).toBeGreaterThan(0);
  });
});
