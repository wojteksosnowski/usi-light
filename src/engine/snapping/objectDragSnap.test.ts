import { describe, it, expect } from 'vitest';
import {
  evaluateEdgeDragSnap,
  evaluateBuildingDragMultiSnap,
  evaluateCollinearAndParallelLock,
} from './objectDragSnap';
import { createCachedLineEquation, buildLineBufferForPolygon } from '../../utils/lineBufferEngine';

describe('evaluateEdgeDragSnap', () => {
  const refEdge = createCachedLineEquation('ref-1', 'bldg-ref', 0, { x: 0, y: 10 }, { x: 20, y: 10 });
  const referenceBuffer = [refEdge];

  it('snaps edge collinear with reference edge when within threshold', () => {
    // Edge at y = 9.8 moving upwards towards y = 10
    const edgeP1 = { x: 5, y: 9.8 };
    const edgeP2 = { x: 15, y: 9.8 };
    const normal = { x: 0, y: 1 }; // Outward normal pointing up

    const snap = evaluateEdgeDragSnap({
      edgeP1,
      edgeP2,
      normal,
      buildingId: 'bldg-moving',
      edgeIndex: 0,
      tentativeDelta: { dx: 0, dy: 0.1 }, // tentative edge at y = 9.9
      referenceBuffer,
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('edge_to_edge_collinear');
    // Original y = 9.8, ref is y = 10, targetD should be 0.2 along normal (0, 1)
    expect(snap?.deltaOffset.dx).toBeCloseTo(0);
    expect(snap?.deltaOffset.dy).toBeCloseTo(0.2);
    expect(snap?.isExtension).toBe(false);
    expect(snap?.label).toContain('Wyrównanie');
  });

  it('detects collinear extension when edge is offset along length', () => {
    // Edge from x = 30 to 40 at y = 10.1 (beyond ref x: 0..20)
    const edgeP1 = { x: 30, y: 10.1 };
    const edgeP2 = { x: 40, y: 10.1 };
    const normal = { x: 0, y: 1 };

    const snap = evaluateEdgeDragSnap({
      edgeP1,
      edgeP2,
      normal,
      buildingId: 'bldg-moving',
      edgeIndex: 0,
      tentativeDelta: { dx: 0, dy: 0 },
      referenceBuffer,
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('edge_to_edge_collinear');
    expect(snap?.isExtension).toBe(true);
    expect(snap?.label).toContain('Przedłużenie');
  });

  it('snaps edge to corner vertex of another building', () => {
    // Reference edge from (10, 0) to (10, 20) (vertical line at x = 10, corners at (10, 0) and (10, 20))
    const vertRef = createCachedLineEquation('ref-2', 'bldg-ref2', 0, { x: 10, y: 0 }, { x: 10, y: 20 });
    // Moving horizontal edge at y = 19.8, normal (0, 1)
    const edgeP1 = { x: 0, y: 19.8 };
    const edgeP2 = { x: 5, y: 19.8 };
    const normal = { x: 0, y: 1 };

    const snap = evaluateEdgeDragSnap({
      edgeP1,
      edgeP2,
      normal,
      buildingId: 'bldg-moving',
      edgeIndex: 0,
      tentativeDelta: { dx: 0, dy: 0.1 }, // tentative y = 19.9, close to vertex (10, 20)
      referenceBuffer: [vertRef],
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('edge_to_vertex');
    expect(snap?.targetPoint).toEqual({ x: 10, y: 20 });
    expect(snap?.deltaOffset.dy).toBeCloseTo(0.2); // Moves from 19.8 to 20.0
  });

  it('ignores reference edges from the same building', () => {
    const edgeP1 = { x: 0, y: 9.9 };
    const edgeP2 = { x: 10, y: 9.9 };
    const normal = { x: 0, y: 1 };

    const snap = evaluateEdgeDragSnap({
      edgeP1,
      edgeP2,
      normal,
      buildingId: 'bldg-ref', // Same as refEdge objectId
      edgeIndex: 0,
      tentativeDelta: { dx: 0, dy: 0 },
      referenceBuffer,
      distanceThresholdMeters: 0.35,
    });

    expect(snap).toBeNull();
  });

  it('returns null when distance exceeds threshold', () => {
    const edgeP1 = { x: 0, y: 5 };
    const edgeP2 = { x: 10, y: 5 };
    const normal = { x: 0, y: 1 };

    const snap = evaluateEdgeDragSnap({
      edgeP1,
      edgeP2,
      normal,
      buildingId: 'bldg-moving',
      edgeIndex: 0,
      tentativeDelta: { dx: 0, dy: 0 },
      referenceBuffer,
      distanceThresholdMeters: 0.35,
    });

    expect(snap).toBeNull();
  });
});

describe('evaluateBuildingDragMultiSnap', () => {
  const refPoly = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const refBuffer = buildLineBufferForPolygon('bldg-1', refPoly);

  it('snaps vertex to vertex (corner to corner)', () => {
    const movingVertices = [
      { x: 10.1, y: 10.1 }, // Close to (10, 10)
      { x: 20.1, y: 10.1 },
      { x: 20.1, y: 20.1 },
      { x: 10.1, y: 20.1 },
    ];

    const snap = evaluateBuildingDragMultiSnap({
      movingVertices,
      movingBuildingId: 'bldg-2',
      referenceBuffer: refBuffer,
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('vertex_to_vertex');
    expect(snap?.deltaX).toBeCloseTo(-0.1);
    expect(snap?.deltaY).toBeCloseTo(-0.1);
  });

  it('snaps simultaneously to two non-parallel guidelines (Dual-Collinear Lock)', () => {
    // Reference buffer with:
    // Line 1: x = 0 (vertical from (0, -100) to (0, 100))
    // Line 2: y = 0 (horizontal from (-100, 0) to (100, 0))
    const line1 = createCachedLineEquation('ref-v', 'bldg-1', 0, { x: 0, y: -100 }, { x: 0, y: 100 });
    const line2 = createCachedLineEquation('ref-h', 'bldg-1', 1, { x: -100, y: 0 }, { x: 100, y: 0 });

    // Moving rectangle at (x: 0.1..10.1, y: -0.15..9.85) (offset by dx=+0.1, dy=-0.15)
    // Left edge is at x = 0.1 (parallel to Line 1 at x=0)
    // Bottom edge is at y = -0.15 (parallel to Line 2 at y=0)
    const movingVertices = [
      { x: 0.1, y: -0.15 },
      { x: 10.1, y: -0.15 },
      { x: 10.1, y: 9.85 },
      { x: 0.1, y: 9.85 },
    ];

    const snap = evaluateBuildingDragMultiSnap({
      movingVertices,
      movingBuildingId: 'bldg-2',
      referenceBuffer: [line1, line2],
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.label).toContain('Podwójne wyrównanie');
    expect(snap?.deltaX).toBeCloseTo(-0.1);
    expect(snap?.deltaY).toBeCloseTo(0.15);
    expect(snap?.secondGuideline).toBeDefined();
  });
});
