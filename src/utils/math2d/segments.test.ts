import { describe, it, expect } from 'vitest';
import { raySegmentIntersection, raySegmentDistance2D, splitSegmentByOccludingPolygons } from './segments';
import { Point2D, Vector2D } from '../../types/geometry';

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

  describe('splitSegmentByOccludingPolygons', () => {
    // Prosta funkcja pomocnicza testu wewnątrz prostokąta [minX..maxX, minY..maxY]
    const isInsideSquare = (pt: Point2D, poly: Point2D[]) => {
      const minX = Math.min(...poly.map((p) => p.x));
      const maxX = Math.max(...poly.map((p) => p.x));
      const minY = Math.min(...poly.map((p) => p.y));
      const maxY = Math.max(...poly.map((p) => p.y));
      return pt.x > minX && pt.x < maxX && pt.y > minY && pt.y < maxY;
    };

    it('1. Partial occlusion: splits segment crossing a higher building into visible and occluded parts', () => {
      // Segment: (0, 5) -> (20, 5)
      const p1: Point2D = { x: 0, y: 5 };
      const p2: Point2D = { x: 20, y: 5 };

      // Higher building footprint: [5, 15] x [0, 10]
      const higherSquare: Point2D[] = [
        { x: 5, y: 0 },
        { x: 15, y: 0 },
        { x: 15, y: 10 },
        { x: 5, y: 10 },
      ];

      const parts = splitSegmentByOccludingPolygons(p1, p2, [higherSquare], isInsideSquare);
      expect(parts.length).toBe(3);

      // Part 1: [0..5, 5] -> visible (not occluded)
      expect(parts[0].p1.x).toBeCloseTo(0, 2);
      expect(parts[0].p2.x).toBeCloseTo(5, 2);
      expect(parts[0].isOccluded).toBe(false);

      // Part 2: [5..15, 5] -> occluded
      expect(parts[1].p1.x).toBeCloseTo(5, 2);
      expect(parts[1].p2.x).toBeCloseTo(15, 2);
      expect(parts[1].isOccluded).toBe(true);

      // Part 3: [15..20, 5] -> visible (not occluded)
      expect(parts[2].p1.x).toBeCloseTo(15, 2);
      expect(parts[2].p2.x).toBeCloseTo(20, 2);
      expect(parts[2].isOccluded).toBe(false);
    });

    it('2. Fully occluded segment inside higher building', () => {
      const p1: Point2D = { x: 6, y: 5 };
      const p2: Point2D = { x: 9, y: 5 };

      const higherSquare: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const parts = splitSegmentByOccludingPolygons(p1, p2, [higherSquare], isInsideSquare);
      expect(parts.length).toBe(1);
      expect(parts[0].isOccluded).toBe(true);
    });

    it('3. Fully outside segment', () => {
      const p1: Point2D = { x: 20, y: 5 };
      const p2: Point2D = { x: 30, y: 5 };

      const higherSquare: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const parts = splitSegmentByOccludingPolygons(p1, p2, [higherSquare], isInsideSquare);
      expect(parts.length).toBe(1);
      expect(parts[0].isOccluded).toBe(false);
    });

    it('4. Stacking multi-level buildings: splits segment occluded by multiple higher polygons', () => {
      // Segment: (0, 5) -> (30, 5)
      const p1: Point2D = { x: 0, y: 5 };
      const p2: Point2D = { x: 30, y: 5 };

      // Two higher towers: Tower A [5..10], Tower B [20..25]
      const towerA: Point2D[] = [
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 5, y: 10 },
      ];
      const towerB: Point2D[] = [
        { x: 20, y: 0 },
        { x: 25, y: 0 },
        { x: 25, y: 10 },
        { x: 20, y: 10 },
      ];

      const parts = splitSegmentByOccludingPolygons(p1, p2, [towerA, towerB], isInsideSquare);
      expect(parts.length).toBe(5);

      // [0..5] visible
      expect(parts[0].isOccluded).toBe(false);
      // [5..10] occluded by Tower A
      expect(parts[1].isOccluded).toBe(true);
      // [10..20] visible
      expect(parts[2].isOccluded).toBe(false);
      // [20..25] occluded by Tower B
      expect(parts[3].isOccluded).toBe(true);
      // [25..30] visible
      expect(parts[4].isOccluded).toBe(false);
    });
  });
});

