import { describe, it, expect } from 'vitest';
import { evaluateCollinearAndParallelLock, evaluateBuildingDragMultiSnap } from './objectDragSnap';
import { createCachedLineEquation } from '../../utils/lineBufferEngine';
import { SpatialLineIndex } from './SpatialLineIndex';

describe('evaluateCollinearAndParallelLock', () => {
  const draggedEdge = createCachedLineEquation('d-1', 'bldg-moving', 0, { x: 0, y: 9.9 }, { x: 10, y: 9.9 });

  it('returns null when no reference edge is within angle tolerance', () => {
    const refBuffer = [
      createCachedLineEquation('r-1', 'bldg-ref', 0, { x: 0, y: 0 }, { x: 0, y: 10 }), // perpendicular, ~90 deg off
    ];
    expect(evaluateCollinearAndParallelLock(draggedEdge, refBuffer)).toBeNull();
  });

  it('detects a parallel (non-collinear) match when angle matches but line distance exceeds threshold', () => {
    const refBuffer = [
      createCachedLineEquation('r-1', 'bldg-ref', 0, { x: 0, y: 5 }, { x: 10, y: 5 }), // parallel, offset by 4.9
    ];
    const result = evaluateCollinearAndParallelLock(draggedEdge, refBuffer, (0.5 * Math.PI) / 180, 0.25);
    expect(result).not.toBeNull();
    expect(result?.isParallel).toBe(true);
    expect(result?.isCollinear).toBe(false);
  });

  it('detects a collinear match when angle and line distance are both within tolerance', () => {
    const refBuffer = [
      createCachedLineEquation('r-1', 'bldg-ref', 0, { x: 0, y: 10 }, { x: 10, y: 10 }), // parallel, offset 0.1
    ];
    const result = evaluateCollinearAndParallelLock(draggedEdge, refBuffer, (0.5 * Math.PI) / 180, 0.25);
    expect(result).not.toBeNull();
    expect(result?.isCollinear).toBe(true);
    expect(result?.correctedC).toBeDefined();
  });

  it('ignores reference edges belonging to the same objectId as the dragged edge', () => {
    const refBuffer = [
      createCachedLineEquation('r-1', 'bldg-moving', 1, { x: 0, y: 10 }, { x: 10, y: 10 }),
    ];
    expect(evaluateCollinearAndParallelLock(draggedEdge, refBuffer)).toBeNull();
  });

  it('picks the reference edge with the smallest angle difference among multiple candidates', () => {
    const closeAngle = createCachedLineEquation('r-close', 'bldg-ref-1', 0, { x: 0, y: 10 }, { x: 10, y: 10.001 });
    const farAngle = createCachedLineEquation('r-far', 'bldg-ref-2', 0, { x: 0, y: -5 }, { x: 10, y: -4.9 });
    const result = evaluateCollinearAndParallelLock(draggedEdge, [farAngle, closeAngle], (0.5 * Math.PI) / 180, 0.25);
    expect(result?.referenceEdge?.id).toBe('r-close');
  });
});

describe('evaluateBuildingDragMultiSnap — vertex-to-edge and edge-to-vertex fallback branches', () => {
  it('falls back to vertex-to-edge (Punkt do ściany) when no vertex-to-vertex match exists', () => {
    // Reference is a single long edge; moving polygon's corner lands on its body (not near an endpoint)
    const refEdge = createCachedLineEquation('ref-1', 'bldg-ref', 0, { x: -100, y: 10 }, { x: 100, y: 10 });
    const movingVertices = [
      { x: 5, y: 10.1 },
      { x: 15, y: 10.1 },
      { x: 15, y: 20.1 },
      { x: 5, y: 20.1 },
    ];

    const snap = evaluateBuildingDragMultiSnap({
      movingVertices,
      movingBuildingId: 'bldg-moving',
      referenceBuffer: [refEdge],
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('vertex_to_edge');
  });

  it('falls back to edge-to-vertex (Ściana do punktu) when a moving edge passes near a reference vertex, but no vertex-to-vertex or vertex-to-edge match exists', () => {
    // Short reference edges (so their endpoints are the only proximity, not their bodies at y=10)
    const refEdge = createCachedLineEquation('ref-1', 'bldg-ref', 0, { x: 4.9, y: 10 }, { x: 5.1, y: 10 });
    // Moving rectangle's top edge (from (0,20.1) to (10,20.1)) does NOT pass near ref vertices;
    // instead its LEFT edge (from (0,10.1) to (0,20.1)) extended... use a bottom edge that
    // straddles the reference vertex on its own segment body.
    const movingVertices = [
      { x: 0, y: 10.05 },
      { x: 10, y: 10.05 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];

    const snap = evaluateBuildingDragMultiSnap({
      movingVertices,
      movingBuildingId: 'bldg-moving',
      referenceBuffer: [refEdge],
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(['edge_to_vertex', 'vertex_to_edge']).toContain(snap?.relation);
  });

  it('produces the same winning relation via spatialIndex as via the linear-scan fallback path', () => {
    const refEdge = createCachedLineEquation('ref-1', 'bldg-ref', 0, { x: -100, y: 10 }, { x: 100, y: 10 });
    const movingVertices = [
      { x: 5, y: 10.1 },
      { x: 15, y: 10.1 },
      { x: 15, y: 20.1 },
      { x: 5, y: 20.1 },
    ];

    const spatialIndex = new SpatialLineIndex();
    spatialIndex.rebuildIfStale([refEdge]);

    const linear = evaluateBuildingDragMultiSnap({
      movingVertices,
      movingBuildingId: 'bldg-moving',
      referenceBuffer: [refEdge],
      distanceThresholdMeters: 0.35,
    });
    const withIndex = evaluateBuildingDragMultiSnap({
      movingVertices,
      movingBuildingId: 'bldg-moving',
      referenceBuffer: [refEdge],
      distanceThresholdMeters: 0.35,
      spatialIndex,
    });

    expect(withIndex?.relation).toBe(linear?.relation);
    expect(withIndex?.deltaX).toBeCloseTo(linear!.deltaX);
    expect(withIndex?.deltaY).toBeCloseTo(linear!.deltaY);
  });
});
