import { describe, it, expect } from 'vitest';
import { computeFreeZone, isSegmentClear, dilateObstacles } from './obstacleZone';
import { isPointInPolygon } from '../../utils/math2d/polygons';

const plot: Point2DList = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 20 },
  { x: 0, y: 20 },
];

const obstacle: Point2DList = [
  { x: 8, y: 8 },
  { x: 12, y: 8 },
  { x: 12, y: 12 },
  { x: 8, y: 12 },
];

type Point2DList = { x: number; y: number }[];

describe('computeFreeZone', () => {
  it('shrinks the free zone as road width increases', () => {
    const narrow = computeFreeZone(plot, [obstacle], 1);
    const wide = computeFreeZone(plot, [obstacle], 6);

    const areaOf = (loops: Point2DList[]) =>
      loops.reduce((sum, loop) => {
        let a = 0;
        for (let i = 0; i < loop.length; i++) {
          const p1 = loop[i];
          const p2 = loop[(i + 1) % loop.length];
          a += p1.x * p2.y - p2.x * p1.y;
        }
        return sum + Math.abs(a) / 2;
      }, 0);

    expect(areaOf(wide)).toBeLessThan(areaOf(narrow));
  });

  it('excludes the obstacle center from the free zone (even-odd rule across outer+hole loops)', () => {
    const free = computeFreeZone(plot, [obstacle], 2);
    const center = { x: 10, y: 10 };
    // computeFreeZone zwraca płaską listę pierścieni (obrys zewnętrzny + dziury jako osobne
    // pierścienie o przeciwnej orientacji) — punkt jest "wolny", gdy leży w nieparzystej
    // liczbie pierścieni (reguła parzystości dla wielokątów z dziurami).
    const containingCount = free.filter((loop) => isPointInPolygon(center, loop)).length;
    expect(containingCount % 2).toBe(0);
  });
});

describe('isSegmentClear', () => {
  it('rejects a segment crossing a dilated obstacle', () => {
    const dilated = dilateObstacles([obstacle], 0.5);
    const blocked = isSegmentClear({ x: 0, y: 10 }, { x: 20, y: 10 }, dilated, null);
    expect(blocked).toBe(false);
  });

  it('accepts a segment that avoids the obstacle entirely', () => {
    const dilated = dilateObstacles([obstacle], 0.5);
    const clear = isSegmentClear({ x: 0, y: 0 }, { x: 20, y: 0 }, dilated, null);
    expect(clear).toBe(true);
  });
});
