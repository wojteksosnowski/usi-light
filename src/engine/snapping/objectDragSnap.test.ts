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

  it('snaps dragged edge corner onto guideline of a non-parallel reference edge (e.g. 45 deg)', () => {
    // Reference edge slanted at 45° from (0, 0) to (10, 10). Guideline equation: x - y = 0
    const slantedRef = createCachedLineEquation('ref-slanted', 'bldg-slanted', 0, { x: 0, y: 0 }, { x: 10, y: 10 });

    // Moving square at (x: 2..8, y: 1.8..6)
    // Dragging top horizontal edge (edge 2) at y = 6, moving up with normal (0, 1)
    // Corner 1 of edge 2 is at (8, 6), Corner 2 of edge 2 is at (2, 6)
    // When dragged to y = 8, Corner 1 reaches (8, 8) which lies on x - y = 0 (slantedRef line)!
    const square: Point2D[] = [
      { x: 2, y: 1.8 },
      { x: 8, y: 1.8 },
      { x: 8, y: 7.9 }, // edgeP1 at (8, 7.9)
      { x: 2, y: 7.9 }, // edgeP2 at (2, 7.9)
    ];

    const snap = evaluateEdgeDragSnap({
      edgeP1: square[2],
      edgeP2: square[3],
      normal: { x: 0, y: 1 },
      buildingId: 'bldg-moving',
      edgeIndex: 2,
      initialVertices: square,
      tentativeDelta: { dx: 0, dy: 0 }, // tentative y = 7.9, target y = 8.0 (diff 0.1m)
      referenceBuffer: [slantedRef],
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('vertex_to_edge');
    expect(snap?.deltaOffset.dy).toBeCloseTo(0.1); // moves top edge from 7.9 to 8.0
    expect(snap?.targetPoint?.x).toBeCloseTo(8.0);
    expect(snap?.targetPoint?.y).toBeCloseTo(8.0);
    expect(snap?.guideline).toBeDefined();
  });

  it('snaps dragged edge corner to external vertex of a non-parallel edge', () => {
    // External edge from (8, 10) to (8, 20) (vertical line at x = 8, corner at (8, 10))
    const refEdge = createCachedLineEquation('ref-v', 'bldg-v', 0, { x: 8, y: 10 }, { x: 8, y: 20 });

    const square: Point2D[] = [
      { x: 2, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 9.85 }, // edgeP1 at (8, 9.85) -> moves vertically along X=8
      { x: 2, y: 9.85 },
    ];

    const snap = evaluateEdgeDragSnap({
      edgeP1: square[2],
      edgeP2: square[3],
      normal: { x: 0, y: 1 },
      buildingId: 'bldg-moving',
      edgeIndex: 2,
      initialVertices: square,
      tentativeDelta: { dx: 0, dy: 0.05 },
      referenceBuffer: [refEdge],
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('vertex_to_vertex');
    expect(snap?.targetPoint).toEqual({ x: 8, y: 10 });
    expect(snap?.deltaOffset.dy).toBeCloseTo(0.15);
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

  it('snaps vertex onto extension guideline of an edge outside physical segment (non-parallel building)', () => {
    // Reference edge from (0, 0) to (10, 0) (y = 0, x in 0..10)
    // Moving triangle whose edges are slanted at 30° / 60°, with vertex at (25, 0.1)
    const movingVertices = [
      { x: 25, y: 0.1 },
      { x: 30, y: 8.76 },
      { x: 20, y: 8.76 },
    ];

    const snap = evaluateBuildingDragMultiSnap({
      movingVertices,
      movingBuildingId: 'bldg-2',
      referenceBuffer: refBuffer,
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('vertex_to_edge');
    expect(snap?.isExtension).toBe(true);
    expect(snap?.label).toContain('przedłużeniu');
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
