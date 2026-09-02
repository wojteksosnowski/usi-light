import { describe, it, expect } from 'vitest';
import {
  AnchorPoint,
  generateTrackingRaysForAnchor,
  calculateOtrackIntersections,
  evaluateOsnapSnap,
  evaluateCollinearAndParallelLock,
  evaluateBuildingDragMultiSnap,
} from './cadOsnapEngine';

import { createCachedLineEquation } from './lineBufferEngine';

describe('cadOsnapEngine', () => {
  const worldToScreenMock = (wx: number, wy: number) => ({ sx: wx * 10, sy: wy * 10 });

  it('generates tracking rays (horizontal, vertical, parallel, perpendicular) for anchor point', () => {
    const anchor: AnchorPoint = {
      id: 'k1',
      point: { x: 5, y: 10 },
      sourceType: 'vertex',
      sourceEdgeAngle: 0, // Horizontal edge
      acquiredAt: Date.now(),
    };

    const rays = generateTrackingRaysForAnchor(anchor, 100);
    expect(rays.length).toBe(4);
    expect(rays.find((r) => r.type === 'horizontal')).toBeDefined();
    expect(rays.find((r) => r.type === 'vertical')).toBeDefined();
    expect(rays.find((r) => r.type === 'parallel')).toBeDefined();
    expect(rays.find((r) => r.type === 'perpendicular')).toBeDefined();
  });

  it('calculates OTRACK ray intersections between 2 anchor points', () => {
    const k1: AnchorPoint = {
      id: 'k1',
      point: { x: 0, y: 0 },
      sourceType: 'vertex',
      acquiredAt: Date.now(),
    };

    const k2: AnchorPoint = {
      id: 'k2',
      point: { x: 10, y: 8 },
      sourceType: 'vertex',
      acquiredAt: Date.now(),
    };

    const intersections = calculateOtrackIntersections([k1, k2], 100);
    expect(intersections.length).toBeGreaterThan(0);

    // K1 horizontal (y=0) and K2 vertical (x=10) should intersect at (10, 0)
    const int1 = intersections.find((i) => Math.abs(i.point.x - 10) < 1e-4 && Math.abs(i.point.y - 0) < 1e-4);
    expect(int1).toBeDefined();

    // K1 vertical (x=0) and K2 horizontal (y=8) should intersect at (0, 8)
    const int2 = intersections.find((i) => Math.abs(i.point.x - 0) < 1e-4 && Math.abs(i.point.y - 8) < 1e-4);
    expect(int2).toBeDefined();
  });

  it('strictly respects OSNAP hierarchy (Priority 1: Endpoint over Midpoint and Nearest)', () => {
    // Segment from (0, 0) to (10, 0)
    const edge = createCachedLineEquation('e1', 'b1', 0, { x: 0, y: 0 }, { x: 10, y: 0 });

    // Cursor near Endpoint (0, 0)
    const snap1 = evaluateOsnapSnap({
      mouseWorld: { x: 0.2, y: 0.1 },
      lineBuffer: [edge],
      worldToScreen: worldToScreenMock,
      screenSnapThresholdPx: 20,
    });

    expect(snap1).not.toBeNull();
    expect(snap1?.priority).toBe(1);
    expect(snap1?.type).toBe('endpoint');
    expect(snap1?.snappedPoint).toEqual({ x: 0, y: 0 });

    // Cursor near Midpoint (5, 0)
    const snap2 = evaluateOsnapSnap({
      mouseWorld: { x: 5.1, y: 0.1 },
      lineBuffer: [edge],
      worldToScreen: worldToScreenMock,
      screenSnapThresholdPx: 20,
    });

    expect(snap2).not.toBeNull();
    expect(snap2?.priority).toBe(4);
    expect(snap2?.type).toBe('midpoint');
    expect(snap2?.snappedPoint).toEqual({ x: 5, y: 0 });

    // Cursor on Edge away from midpoint and endpoints -> Nearest
    const snap3 = evaluateOsnapSnap({
      mouseWorld: { x: 2.5, y: 0.2 },
      lineBuffer: [edge],
      worldToScreen: worldToScreenMock,
      screenSnapThresholdPx: 20,
    });

    expect(snap3).not.toBeNull();
    expect(snap3?.priority).toBe(5);
    expect(snap3?.type).toBe('nearest');
    expect(snap3?.snappedPoint.x).toBeCloseTo(2.5);
    expect(snap3?.snappedPoint.y).toBeCloseTo(0);
  });

  it('evaluates OTRACK Intersection with priority 2 over Midpoint and Nearest', () => {
    const edge = createCachedLineEquation('e1', 'b1', 0, { x: 0, y: 0 }, { x: 20, y: 0 });
    const k1: AnchorPoint = { id: 'k1', point: { x: 5, y: 0 }, sourceType: 'midpoint', acquiredAt: Date.now() };
    const k2: AnchorPoint = { id: 'k2', point: { x: 0, y: 5 }, sourceType: 'vertex', acquiredAt: Date.now() };

    // Intersection of k1 vertical (x=5) and k2 horizontal (y=5) is at (5, 5)
    const snap = evaluateOsnapSnap({
      mouseWorld: { x: 5.1, y: 4.9 },
      lineBuffer: [edge],
      acquiredPoints: [k1, k2],
      worldToScreen: worldToScreenMock,
      screenSnapThresholdPx: 20,
    });

    expect(snap).not.toBeNull();
    expect(snap?.priority).toBe(2);
    expect(snap?.type).toBe('otrack_intersection');
    expect(snap?.snappedPoint.x).toBeCloseTo(5);
    expect(snap?.snappedPoint.y).toBeCloseTo(5);
  });

  it('detects collinear lock and parallel snap for aligned edges', () => {
    // Reference edge on y=10: 0*x + 1*y - 10 = 0
    const refEdge = createCachedLineEquation('ref1', 'b_ref', 0, { x: 0, y: 10 }, { x: 20, y: 10 });
    // Dragged edge close to y=10 (e.g. y=10.05)
    const dragEdge = createCachedLineEquation('drag1', 'b_drag', 0, { x: 5, y: 10.05 }, { x: 15, y: 10.05 });

    const lock = evaluateCollinearAndParallelLock(dragEdge, [refEdge], 0.05, 0.2);
    expect(lock).not.toBeNull();
    expect(lock?.isParallel).toBe(true);
    expect(lock?.isCollinear).toBe(true);
    expect(lock?.correctedC).toBe(refEdge.C);
  });

  describe('evaluateBuildingDragMultiSnap', () => {
    const refEdge = createCachedLineEquation('ref1', 'b_ref', 0, { x: 0, y: 0 }, { x: 10, y: 0 });

    it('snaps Vertex-to-Vertex (corner lock) when corner is near reference corner', () => {
      // Moving building corner at (10.1, 0.05) near (10, 0)
      const movingVerts = [
        { x: 10.1, y: 0.05 },
        { x: 20.1, y: 0.05 },
        { x: 20.1, y: 10.05 },
        { x: 10.1, y: 10.05 },
      ];

      const snap = evaluateBuildingDragMultiSnap({
        movingVertices: movingVerts,
        movingBuildingId: 'b_move',
        referenceBuffer: [refEdge],
        distanceThresholdMeters: 0.3,
      });

      expect(snap).not.toBeNull();
      expect(snap?.relation).toBe('vertex_to_vertex');
      expect(snap?.deltaX).toBeCloseTo(-0.1);
      expect(snap?.deltaY).toBeCloseTo(-0.05);
    });

    it('snaps Vertex-to-Edge when corner is near reference edge body', () => {
      // Moving building corner at (5.0, 0.1) near edge (0,0)->(10,0)
      const movingVerts = [
        { x: 5.0, y: 0.1 },
        { x: 15.0, y: 0.1 },
        { x: 15.0, y: 10.1 },
        { x: 5.0, y: 10.1 },
      ];

      const snap = evaluateBuildingDragMultiSnap({
        movingVertices: movingVerts,
        movingBuildingId: 'b_move',
        referenceBuffer: [refEdge],
        distanceThresholdMeters: 0.3,
      });

      expect(snap).not.toBeNull();
      expect(snap?.relation).toBe('vertex_to_edge');
      expect(snap?.deltaY).toBeCloseTo(-0.1);
    });

    it('detects Collinear Extension Tracking when moving wall is on virtual extension', () => {
      // Moving building edge from (15, 0.05) to (25, 0.05) along y=0 extension
      const movingVerts = [
        { x: 15.0, y: 0.05 },
        { x: 25.0, y: 0.05 },
        { x: 25.0, y: 10.05 },
        { x: 15.0, y: 10.05 },
      ];

      const snap = evaluateBuildingDragMultiSnap({
        movingVertices: movingVerts,
        movingBuildingId: 'b_move',
        referenceBuffer: [refEdge],
        distanceThresholdMeters: 0.3,
      });

      expect(snap).not.toBeNull();
      expect(snap?.relation).toBe('edge_to_edge_collinear');
      expect(snap?.isExtension).toBe(true);
      expect(snap?.deltaY).toBeCloseTo(-0.05);
      expect(snap?.guideline).toBeDefined();
    });
  });
});

