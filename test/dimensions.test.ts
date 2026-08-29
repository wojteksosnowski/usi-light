import { describe, it, expect } from 'vitest';
import {
  computeLinearDimension,
  computeAngularDimension,
  closestPointOnSegment,
} from '../src/utils/math2d';
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
      const s1_b = { x: 10, y: 0 };
      const s2_a = { x: 5, y: -2 };
      const s2_b = { x: 5, y: 2 };

      const res = computeLinearDimension(s1_a, s1_b, s2_a, s2_b);
      expect(res.distance).toBeCloseTo(0.0);
    });
  });

  describe('computeAngularDimension', () => {
    it('accurately computes 90.0° angle between perpendicular segments', () => {
      const s1_a = { x: 0, y: 0 };
      const s1_b = { x: 10, y: 0 };
      const s2_a = { x: 0, y: 0 };
      const s2_b = { x: 0, y: 10 };

      const res = computeAngularDimension(s1_a, s1_b, s2_a, s2_b);
      expect(res.angleDeg).toBeCloseTo(90.0);
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
  });
});
