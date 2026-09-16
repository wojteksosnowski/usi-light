import { describe, it, expect } from 'vitest';
import {
  fastUnionTwoSimpleLoops,
  fastUnionTwoPolygonsWithHoles,
  findSegmentIntersection,
} from './polygonBooleanTwo';
import { Point2D } from '../../types/geometry';
import { calculateSignedArea } from './polygons';

describe('polygonBooleanTwo - Fast 2-Polygon Boolean Union', () => {
  describe('Segment Intersections', () => {
    it('detects simple cross intersection between two orthogonal segments', () => {
      const p1 = { x: 0, y: 5 };
      const p2 = { x: 10, y: 5 };
      const q1 = { x: 5, y: 0 };
      const q2 = { x: 5, y: 10 };

      const res = findSegmentIntersection(p1, p2, q1, q2);
      expect(res).toBeDefined();
      expect(res?.point.x).toBeCloseTo(5);
      expect(res?.point.y).toBeCloseTo(5);
      expect(res?.t).toBeCloseTo(0.5);
      expect(res?.u).toBeCloseTo(0.5);
    });

    it('returns null for parallel or non-intersecting segments', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 0 };
      const q1 = { x: 0, y: 5 };
      const q2 = { x: 10, y: 5 };

      expect(findSegmentIntersection(p1, p2, q1, q2)).toBeNull();
    });
  });

  describe('fastUnionTwoSimpleLoops - Basic & Overlapping Shapes', () => {
    it('unions two partially overlapping rectangles', () => {
      const polyA: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const polyB: Point2D[] = [
        { x: 5, y: 0 },
        { x: 15, y: 0 },
        { x: 15, y: 10 },
        { x: 5, y: 10 },
      ];

      const res = fastUnionTwoSimpleLoops(polyA, polyB);
      expect(res).toBeDefined();
      expect(res?.outer.length).toBeGreaterThanOrEqual(4);
      expect(calculateSignedArea(res!.outer)).toBeCloseTo(150, 0); // 100 + 100 - 50 = 150 m2
      expect(res?.holes.length).toBe(0);
    });

    it('handles full containment where polyA is inside polyB', () => {
      const inner: Point2D[] = [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 4 },
        { x: 2, y: 4 },
      ];
      const outer: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const res = fastUnionTwoSimpleLoops(inner, outer);
      expect(res).toBeDefined();
      expect(res?.outer).toEqual(outer);
      expect(res?.holes.length).toBe(0);
    });

    it('returns null for disjoint polygons', () => {
      const polyA: Point2D[] = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
        { x: 0, y: 5 },
      ];
      const polyB: Point2D[] = [
        { x: 20, y: 0 },
        { x: 25, y: 0 },
        { x: 25, y: 5 },
        { x: 20, y: 5 },
      ];

      const res = fastUnionTwoSimpleLoops(polyA, polyB);
      expect(res).toBeNull();
    });
  });

  describe('Hole creation from two C-shaped polygons', () => {
    it('creates an internal hole when two C-shaped polygons join to form a donut', () => {
      // Shape A: Top C bracket
      // [0, 10] to [30, 30] with a cutout at bottom center [10, 10] to [20, 20]
      const cTop: Point2D[] = [
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 20 },
        { x: 20, y: 20 },
        { x: 20, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 30 },
        { x: 0, y: 30 },
      ];

      // Shape B: Bottom C bracket
      // [0, 0] to [30, 20] overlapping with the legs of cTop
      const cBottom: Point2D[] = [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 20 },
        { x: 20, y: 20 },
        { x: 20, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 20 },
        { x: 0, y: 20 },
      ];

      const res = fastUnionTwoSimpleLoops(cTop, cBottom);
      expect(res).toBeDefined();
      expect(res?.outer).toBeDefined();
      expect(res?.holes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('fastUnionTwoPolygonsWithHoles - Advanced Hole Handling', () => {
    it('preserves an external hole that does not intersect the joining polygon', () => {
      const polyWithHole = {
        outer: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        holes: [
          [
            { x: 2, y: 2 },
            { x: 6, y: 2 },
            { x: 6, y: 6 },
            { x: 2, y: 6 },
          ],
        ],
      };

      const polyB = {
        outer: [
          { x: 15, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 20 },
          { x: 15, y: 20 },
        ],
        holes: [],
      };

      const res = fastUnionTwoPolygonsWithHoles(polyWithHole, polyB);
      expect(res.success).toBe(true);
      expect(res.result).toBeDefined();
      expect(res.result![0].holes.length).toBe(1);
    });

    it('floods/removes a hole when polyB completely covers it with solid mass', () => {
      const polyWithHole = {
        outer: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        holes: [
          [
            { x: 12, y: 2 },
            { x: 16, y: 2 },
            { x: 16, y: 6 },
            { x: 12, y: 6 },
          ],
        ],
      };

      // PolyB covers [10, 0] to [30, 20] completely covering the hole at [12..16, 2..6]
      const polyB = {
        outer: [
          { x: 10, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 20 },
          { x: 10, y: 20 },
        ],
        holes: [],
      };

      const res = fastUnionTwoPolygonsWithHoles(polyWithHole, polyB);
      expect(res.success).toBe(true);
      expect(res.result![0].holes.length).toBe(0);
    });

    it('preserves hole when both polygons have overlapping holes at the same position', () => {
      const hole = [
        { x: 12, y: 2 },
        { x: 16, y: 2 },
        { x: 16, y: 6 },
        { x: 12, y: 6 },
      ];

      const polyA = {
        outer: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        holes: [hole],
      };

      const polyB = {
        outer: [
          { x: 10, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 20 },
          { x: 10, y: 20 },
        ],
        holes: [hole],
      };

      const res = fastUnionTwoPolygonsWithHoles(polyA, polyB);
      expect(res.success).toBe(true);
      expect(res.result![0].holes.length).toBe(1);
    });
  });
});
