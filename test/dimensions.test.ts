import { describe, it, expect } from 'vitest';
import {
  computeLinearDimension,
  computeAngularDimension,
  closestPointOnSegment,
  computeEdgeAdjacentPerpendicularDistance,
} from '@/utils/math2d';
import { Point2D } from '../src/types/geometry';

describe('Dimension Tools (Wymiar)', () => {
  describe('closestPointOnSegment', () => {
    it('returns projection on segment when within endpoints', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 10, y: 0 };
      const p = { x: 4, y: 5 };
      const proj = closestPointOnSegment(p, a, b);
      expect(proj.x).toBeCloseTo(4);
      expect(proj.y).toBeCloseTo(0);
    });

    it('clamps to endpoints when outside segment span', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 10, y: 0 };
      const p = { x: 15, y: 2 };
      const proj = closestPointOnSegment(p, a, b);
      expect(proj.x).toBeCloseTo(10);
      expect(proj.y).toBeCloseTo(0);
    });
  });

  describe('computeLinearDimension', () => {
    it('accurately measures distance between parallel segments with perpendicular connection', () => {
      const s1_a = { x: 0, y: 0 };
      const s1_b = { x: 10, y: 0 };
      const s2_a = { x: 0, y: 8 };
      const s2_b = { x: 10, y: 8 };

      const res = computeLinearDimension(s1_a, s1_b, s2_a, s2_b);
      expect(res.isParallel).toBe(true);
      expect(res.distance).toBeCloseTo(8.0);
      expect(res.p1.y).toBeCloseTo(0);
      expect(res.p2.y).toBeCloseTo(8);
      expect(res.p1.x).toBeCloseTo(res.p2.x); // perpendicular connection
    });

    it('measures closest distance for non-parallel segments and connects touching endpoints/projections', () => {
      const s1_a = { x: 0, y: 0 };
      const s1_b = { x: 10, y: 0 };
      const s2_a = { x: 4, y: 3 };
      const s2_b = { x: 14, y: 10 };

      const res = computeLinearDimension(s1_a, s1_b, s2_a, s2_b);
      expect(res.isParallel).toBe(false);
      expect(res.distance).toBeCloseTo(3.0);
      expect(res.p1.x).toBeCloseTo(4);
      expect(res.p1.y).toBeCloseTo(0);
      expect(res.p2.x).toBeCloseTo(4);
      expect(res.p2.y).toBeCloseTo(3);
    });

    it('measures zero distance for intersecting segments', () => {
      const s1_a = { x: 0, y: 0 };
      const s1_b = { x: 10, y: 10 };
      const s2_a = { x: 0, y: 10 };
      const s2_b = { x: 10, y: 0 };

      const res = computeLinearDimension(s1_a, s1_b, s2_a, s2_b);
      expect(res.distance).toBeCloseTo(0.0);
    });
  });

  describe('computeAngularDimension', () => {
    it('accurately computes 90.0° angle for perpendicular segments meeting at corner', () => {
      const s1_a = { x: 0, y: 0 };
      const s1_b = { x: 10, y: 0 };
      const s2_a = { x: 0, y: 0 };
      const s2_b = { x: 0, y: 10 };

      const res = computeAngularDimension(s1_a, s1_b, s2_a, s2_b);
      expect(res.angleDeg).toBeCloseTo(90.0);
      expect(res.isParallel).toBe(false);
      expect(res.intersection.x).toBeCloseTo(0);
      expect(res.intersection.y).toBeCloseTo(0);
    });

    it('accurately computes 45.0° angle for diagonal segments', () => {
      const s1_a = { x: 0, y: 0 };
      const s1_b = { x: 10, y: 0 };
      const s2_a = { x: 0, y: 0 };
      const s2_b = { x: 10, y: 10 };

      const res = computeAngularDimension(s1_a, s1_b, s2_a, s2_b);
      expect(res.angleDeg).toBeCloseTo(45.0);
    });

    it('computes 0° for parallel segments', () => {
      const s1_a = { x: 0, y: 0 };
      const s1_b = { x: 10, y: 0 };
      const s2_a = { x: 0, y: 5 };
      const s2_b = { x: 10, y: 5 };

      const res = computeAngularDimension(s1_a, s1_b, s2_a, s2_b);
      expect(res.angleDeg).toBeCloseTo(0.0);
      expect(res.isParallel).toBe(true);
    });

    it('computes touchRadiusWorld close to segment midpoints', () => {
      const s1_a = { x: 5, y: 0 };
      const s1_b = { x: 15, y: 0 };
      const s2_a = { x: 0, y: 8 };
      const s2_b = { x: 0, y: 18 };

      // Intersection is at (0, 0), mid1=(10, 0), mid2=(0, 13)
      const res = computeAngularDimension(s1_a, s1_b, s2_a, s2_b);
      expect(res.angleDeg).toBeCloseTo(90.0);
      expect(res.intersection.x).toBeCloseTo(0);
      expect(res.intersection.y).toBeCloseTo(0);
      // touchRadiusWorld must be close to average midpoint distance (10 + 13) / 2 = 11.5
      expect(res.touchRadiusWorld).toBeCloseTo(11.5);
    });
  });

  describe('computeEdgeAdjacentPerpendicularDistance', () => {
    it('computes perpendicular distance for rectangle correctly', () => {
      // 30m x 20m rectangle: (0,0) -> (30,0) -> (30,20) -> (0,20)
      const rect: Point2D[] = [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 20 },
        { x: 0, y: 20 },
      ];

      // Edge 0: (0,0) -> (30,0) (length 30).
      // Adjacent edges go to (0,20) and (30,20), both at perpendicular distance 20m
      const distEdge0 = computeEdgeAdjacentPerpendicularDistance(rect, 0);
      expect(distEdge0).toBe(20.0);

      // Edge 1: (30,0) -> (30,20) (length 20).
      // Adjacent edges go to (0,0) and (0,20), both at perpendicular distance 30m
      const distEdge1 = computeEdgeAdjacentPerpendicularDistance(rect, 1);
      expect(distEdge1).toBe(30.0);
    });

    it('computes perpendicular distance to closest adjacent vertex for an L-shaped polygon', () => {
      // L-shape:
      // (0,0) -> (40,0) -> (40,15) -> (20,15) -> (20,30) -> (0,30)
      const lShape: Point2D[] = [
        { x: 0, y: 0 },     // 0
        { x: 40, y: 0 },    // 1 (Edge 0: 0->1, len 40)
        { x: 40, y: 15 },   // 2 (Edge 1: 1->2, len 15)
        { x: 20, y: 15 },   // 3 (Edge 2: 2->3, len 20)
        { x: 20, y: 30 },   // 4 (Edge 3: 3->4, len 15)
        { x: 0, y: 30 },    // 5 (Edge 4: 4->5, len 20)
      ];

      // Edge 0: (0,0)->(40,0). Prev vertex is 5:(0,30) (dy=30), next vertex is 2:(40,15) (dy=15).
      // Min perpendicular distance is min(30, 15) = 15m.
      const distEdge0 = computeEdgeAdjacentPerpendicularDistance(lShape, 0);
      expect(distEdge0).toBe(15.0);
    });
  });
});
