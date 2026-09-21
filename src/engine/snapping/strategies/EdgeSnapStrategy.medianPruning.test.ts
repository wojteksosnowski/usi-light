import { describe, it, expect } from 'vitest';
import { EdgeSnapStrategy } from './EdgeSnapStrategy';
import { SnapContext } from '../types';
import { createCachedLineEquation, CachedLineEquation } from '../../../utils/lineBufferEngine';
import { Point2D } from '../../../types/geometry';

const PX_PER_METER = 20;

function worldToScreen(wx: number, wy: number) {
  return { sx: wx * PX_PER_METER, sy: wy * PX_PER_METER };
}
function screenToWorld(sx: number, sy: number) {
  return { wx: sx / PX_PER_METER, wy: sy / PX_PER_METER };
}

function makeContext(mouseWorld: Point2D, lineBuffer: CachedLineEquation[]): SnapContext {
  return {
    mouseWorld,
    mouseScreen: worldToScreen(mouseWorld.x, mouseWorld.y),
    worldToScreen,
    screenToWorld,
    buildings: [],
    lineBuffer,
    isOsnapActive: true,
    isDirectionSnappingActive: false,
    debugCollectEdgeHpf: true,
  };
}

// Six parallel vertical edges of equal length placed at increasing world-distance from the
// cursor (all still within the ~12px aperture). Length is held constant so Score_edge =
// computeEdgeScore(...) varies purely with the distance term, letting the test assert the
// median cutoff picks the three closest edges deterministically.
function buildEdgesAtOffsets(offsets: number[]): CachedLineEquation[] {
  return offsets.map((x, i) =>
    createCachedLineEquation(`edge_${i}`, `obj_${i}`, 0, { x, y: -5 }, { x, y: 5 })
  );
}

describe('EdgeSnapStrategy median pruning (spec Faza 1, Score_edge)', () => {
  const strategy = new EdgeSnapStrategy();
  const cursor: Point2D = { x: 0, y: 0 };

  it('drops the bottom 50% of candidates ranked by computeEdgeScore, not by length/distance', () => {
    // Distances (m) from cursor: 0.55, 0.45, 0.35, 0.25, 0.15, 0.05 — all equal length,
    // so Score_edge is monotonic in distance and the three nearest must survive.
    const offsets = [-0.55, -0.45, -0.35, -0.25, -0.15, -0.05];
    const edges = buildEdgesAtOffsets(offsets);
    const context = makeContext(cursor, edges);

    const results = strategy.findAllSnaps(cursor, context);

    expect(context.debugEdgeHpfCandidates).toBeDefined();
    expect(context.debugEdgeHpfCandidates!.length).toBe(6);

    const passedXs = context.debugEdgeHpfCandidates!.filter((c) => c.passed).map((c) => Math.round(c.point.x * 100) / 100);
    const failedXs = context.debugEdgeHpfCandidates!.filter((c) => !c.passed).map((c) => Math.round(c.point.x * 100) / 100);

    expect(passedXs.length).toBe(3);
    expect(failedXs.length).toBe(3);
    expect(passedXs.sort()).toEqual([-0.25, -0.15, -0.05].sort());
    expect(failedXs.sort()).toEqual([-0.55, -0.45, -0.35].sort());

    // The strategy's own returned results must equal exactly the surviving (passed) set.
    expect(results.length).toBe(3);
  });

  it('does not prune when fewer than 5 candidates are in range (MIN_CANDIDATES_FOR_CUTOFF guard)', () => {
    const offsets = [-0.4, -0.3, -0.2, -0.1];
    const edges = buildEdgesAtOffsets(offsets);
    const context = makeContext(cursor, edges);

    const results = strategy.findAllSnaps(cursor, context);

    expect(context.debugEdgeHpfCandidates!.length).toBe(4);
    expect(context.debugEdgeHpfCandidates!.every((c) => c.passed)).toBe(true);
    expect(results.length).toBe(4);
  });
});
