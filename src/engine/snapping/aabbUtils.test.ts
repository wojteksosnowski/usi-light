import { describe, it, expect } from 'vitest';
import { computeAABB } from './aabbUtils';

describe('computeAABB', () => {
  it('computes the bounding box of a set of points with no padding', () => {
    const box = computeAABB([
      { x: 1, y: 5 },
      { x: -2, y: 3 },
      { x: 4, y: -1 },
    ]);
    expect(box).toEqual({ minX: -2, minY: -1, maxX: 4, maxY: 5 });
  });

  it('applies symmetric padding in every direction', () => {
    const box = computeAABB([{ x: 0, y: 0 }, { x: 10, y: 10 }], 2);
    expect(box).toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 12 });
  });

  it('collapses to a zero-area box (plus padding) for a single point', () => {
    const box = computeAABB([{ x: 5, y: 5 }], 1);
    expect(box).toEqual({ minX: 4, minY: 4, maxX: 6, maxY: 6 });
  });
});
