import { describe, it, expect } from 'vitest';
import {
  evaluateCollinearAndParallelLock,
  evaluateBuildingDragMultiSnap,
} from './cadObjectSnapEngine';
import { createCachedLineEquation } from './lineBufferEngine';

describe('cadObjectSnapEngine', () => {
  const refEdge = createCachedLineEquation('ref1', 'b_ref', 0, { x: 0, y: 0 }, { x: 10, y: 0 });

  it('evaluates collinear and parallel lock', () => {
    const dragEdge = createCachedLineEquation('drag1', 'b_drag', 0, { x: 5, y: 0.05 }, { x: 15, y: 0.05 });
    const lock = evaluateCollinearAndParallelLock(dragEdge, [refEdge], 0.05, 0.2);
    expect(lock).not.toBeNull();
    expect(lock?.isParallel).toBe(true);
    expect(lock?.isCollinear).toBe(true);
  });

  it('performs multi-relation building drag snap with AABB culling and projection', () => {
    const movingVerts = [
      { x: 10.05, y: 0.02 },
      { x: 20.05, y: 0.02 },
      { x: 20.05, y: 10.02 },
      { x: 10.05, y: 10.02 },
    ];

    const snap = evaluateBuildingDragMultiSnap({
      movingVertices: movingVerts,
      movingBuildingId: 'b_move',
      referenceBuffer: [refEdge],
      distanceThresholdMeters: 0.3,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('vertex_to_vertex');
    expect(snap?.deltaX).toBeCloseTo(-0.05);
    expect(snap?.deltaY).toBeCloseTo(-0.02);
  });
});
