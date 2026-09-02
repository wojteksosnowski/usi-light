import { describe, it, expect } from 'vitest';
import {
  computeLineEquation,
  rebuildBuildingSegments,
  analyzeSegmentsStatistics,
} from '../src/utils/segmentStatistics';
import { createBuildingFromVertices } from '../src/utils/dxfParser';
import { Point2D } from '../src/types/geometry';

describe('Segment Statistics & Linear Equations (Analiza Statystyczna Odcinków)', () => {
  describe('computeLineEquation', () => {
    it('computes normalized general equation Ax + By + C = 0 and slope-intercept for horizontal line', () => {
      const p1: Point2D = { x: 0, y: 5 };
      const p2: Point2D = { x: 10, y: 5 };
      const eq = computeLineEquation(p1, p2);

      expect(eq.isVertical).toBe(false);
      expect(eq.slope).toBeCloseTo(0);
      expect(eq.intercept).toBeCloseTo(5);
      expect(eq.angleDeg).toBeCloseTo(0);
      expect(Math.hypot(eq.A, eq.B)).toBeCloseTo(1.0);
      // Ax + By + C = 0 for p1
      expect(eq.A * p1.x + eq.B * p1.y + eq.C).toBeCloseTo(0);
    });

    it('computes equation for vertical line', () => {
      const p1: Point2D = { x: 7, y: 0 };
      const p2: Point2D = { x: 7, y: 15 };
      const eq = computeLineEquation(p1, p2);

      expect(eq.isVertical).toBe(true);
      expect(eq.slope).toBeUndefined();
      expect(eq.angleDeg).toBeCloseTo(90);
      expect(Math.hypot(eq.A, eq.B)).toBeCloseTo(1.0);
      expect(eq.A * p1.x + eq.B * p1.y + eq.C).toBeCloseTo(0);
    });

    it('computes equation for diagonal line at 45 degrees', () => {
      const p1: Point2D = { x: 0, y: 0 };
      const p2: Point2D = { x: 10, y: 10 };
      const eq = computeLineEquation(p1, p2);

      expect(eq.isVertical).toBe(false);
      expect(eq.slope).toBeCloseTo(1.0);
      expect(eq.intercept).toBeCloseTo(0);
      expect(eq.angleDeg).toBeCloseTo(45);
    });
  });

  describe('rebuildBuildingSegments (Vertex Edit)', () => {
    it('updates building vertices and recalculates all facade segments and normals', () => {
      const initialVerts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const building = createBuildingFromVertices(initialVerts, 'Bldg 1', 15.0, true);

      // Modify vertex 2 (top right) to make an L-shape by adding a 5th vertex
      const updatedVerts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 10 },
        { x: 0, y: 10 },
      ];

      const rebuilt = rebuildBuildingSegments(building, updatedVerts);
      expect(rebuilt.vertices.length).toBe(6);
      expect(rebuilt.segments.length).toBe(6);
      expect(rebuilt.segments[0].length).toBeCloseTo(10);
      expect(rebuilt.segments[1].length).toBeCloseTo(5);
      expect(rebuilt.segments[2].length).toBeCloseTo(5);
      expect(rebuilt.segments.every((s) => s.lineEquation !== undefined)).toBe(true);
    });
  });

  describe('analyzeSegmentsStatistics', () => {
    it('detects dominant orthogonal grid and angle distribution', () => {
      const bldg1 = createBuildingFromVertices(
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 10 },
          { x: 0, y: 10 },
        ],
        'Bldg 1',
        15.0,
        true
      );

      const stats = analyzeSegmentsStatistics([bldg1]);
      expect(stats.totalSegments).toBe(4);
      expect(stats.totalLength).toBeCloseTo(60);
      expect(stats.dominantDirections.length).toBeGreaterThan(0);
      expect(stats.dominantDirections[0].angleDeg).toBeCloseTo(0);
      expect(stats.dominantDirections[0].orthogonalDeg).toBeCloseTo(90);
      expect(stats.dominantDirections[0].percentage).toBeCloseTo(100);

      // Verify active tracking flag in angle bins
      const bin0 = stats.angleBins.find((b) => b.binStartDeg === 0);
      expect(bin0?.isTrackingActive).toBe(true);
    });

    it('filters out noisy short segments when noisePercentileCutoff is provided', () => {
      // Building with 2 long segments (20m) and multiple short chamfer/noise segments (0.1m)
      const bldg = createBuildingFromVertices(
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20.1, y: 0.1 },
          { x: 20.2, y: 0.15 },
          { x: 20.2, y: 10 },
          { x: 0, y: 10 },
        ],
        'Bldg Noisy',
        10.0,
        true
      );

      const statsWithCutoff = analyzeSegmentsStatistics([bldg], { noisePercentileCutoff: 30 });
      expect(statsWithCutoff.noisePercentileCutoff).toBe(30);
      expect(statsWithCutoff.lengthCutoffMeters).toBeGreaterThan(0.1);
      expect(statsWithCutoff.dominantDirections.length).toBeGreaterThan(0);
    });
  });
});
