import { describe, it, expect } from 'vitest';
import { raySegmentIntersection, raySegmentDistance2D } from './math2d';
import { Point2D, Vector2D } from '../types/geometry';

describe('raySegmentDistance2D vs raySegmentIntersection equivalence', () => {
  it('produces identical intersection distances on a fixed set of edge cases', () => {
    const origin: Point2D = { x: 0, y: 0 };
    const dir: Vector2D = { x: 1, y: 0 };

    // 1. Direct hit in front
    const p1: Point2D = { x: 5, y: -2 };
    const p2: Point2D = { x: 5, y: 2 };
    const hit1 = raySegmentIntersection(origin, dir, p1, p2);
    const dist1 = raySegmentDistance2D(origin.x, origin.y, dir.x, dir.y, p1.x, p1.y, p2.x, p2.y);
    expect(hit1.hit).toBe(true);
    expect(dist1).toBeCloseTo(hit1.distance, 6);
    expect(dist1).toBeCloseTo(5.0, 6);

    // 2. Segment behind the ray
    const p3: Point2D = { x: -5, y: -2 };
    const p4: Point2D = { x: -5, y: 2 };
    const hit2 = raySegmentIntersection(origin, dir, p3, p4);
    const dist2 = raySegmentDistance2D(origin.x, origin.y, dir.x, dir.y, p3.x, p3.y, p4.x, p4.y);
    expect(hit2.hit).toBe(false);
    expect(dist2).toBe(Infinity);

    // 3. Parallel ray (no intersection)
    const p5: Point2D = { x: 0, y: 2 };
    const p6: Point2D = { x: 10, y: 2 };
    const hit3 = raySegmentIntersection(origin, dir, p5, p6);
    const dist3 = raySegmentDistance2D(origin.x, origin.y, dir.x, dir.y, p5.x, p5.y, p6.x, p6.y);
    expect(hit3.hit).toBe(false);
    expect(dist3).toBe(Infinity);

    // 4. Ray misses segment (passes to the side)
    const p7: Point2D = { x: 5, y: 1 };
    const p8: Point2D = { x: 5, y: 5 };
    const hit4 = raySegmentIntersection(origin, dir, p7, p8);
    const dist4 = raySegmentDistance2D(origin.x, origin.y, dir.x, dir.y, p7.x, p7.y, p8.x, p8.y);
    expect(hit4.hit).toBe(false);
    expect(dist4).toBe(Infinity);
  });

  it('matches exactly across 100,000 random rays and segments', () => {
    let rngSeed = 123456789;
    const pseudoRandom = () => {
      rngSeed = (rngSeed * 1664525 + 1013904223) % 4294967296;
      return rngSeed / 4294967296;
    };

    let hitsCount = 0;
    for (let i = 0; i < 100_000; i++) {
      const ox = (pseudoRandom() - 0.5) * 200;
      const oy = (pseudoRandom() - 0.5) * 200;
      const angle = pseudoRandom() * 2 * Math.PI;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      const p1x = (pseudoRandom() - 0.5) * 200;
      const p1y = (pseudoRandom() - 0.5) * 200;
      const p2x = (pseudoRandom() - 0.5) * 200;
      const p2y = (pseudoRandom() - 0.5) * 200;

      const origin: Point2D = { x: ox, y: oy };
      const dir: Vector2D = { x: dx, y: dy };
      const p1: Point2D = { x: p1x, y: p1y };
      const p2: Point2D = { x: p2x, y: p2y };

      const objResult = raySegmentIntersection(origin, dir, p1, p2);
      const fastDist = raySegmentDistance2D(ox, oy, dx, dy, p1x, p1y, p2x, p2y);

      if (objResult.hit) {
        hitsCount++;
        expect(fastDist).toBeCloseTo(objResult.distance, 5);
      } else {
        expect(fastDist).toBe(Infinity);
      }
    }

    expect(hitsCount).toBeGreaterThan(1000);
  }, 20000);
});
