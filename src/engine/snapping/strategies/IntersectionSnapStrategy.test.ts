import { describe, it, expect } from 'vitest';
import { IntersectionSnapStrategy } from './IntersectionSnapStrategy';
import { SnapContext } from '../types';
import { createCachedLineEquation } from '../../../utils/lineBufferEngine';
import { SpatialLineIndex } from '../SpatialLineIndex';
import { Point2D } from '../../../types/geometry';

const PX_PER_METER = 20;
function worldToScreen(wx: number, wy: number) {
  return { sx: wx * PX_PER_METER, sy: wy * PX_PER_METER };
}

function makeContext(overrides: Partial<SnapContext> & { mouseWorld: Point2D }): SnapContext {
  return {
    mouseScreen: worldToScreen(overrides.mouseWorld.x, overrides.mouseWorld.y),
    worldToScreen,
    screenToWorld: (sx, sy) => ({ wx: sx / PX_PER_METER, wy: sy / PX_PER_METER }),
    buildings: [],
    lineBuffer: [],
    isOsnapActive: true,
    isDirectionSnappingActive: false,
    thresholdPx: 12,
    ...overrides,
  };
}

describe('IntersectionSnapStrategy', () => {
  const strategy = new IntersectionSnapStrategy();

  // Two crossing segments intersecting at (5, 5)
  const horiz = createCachedLineEquation('h-1', 'bldg-h', 0, { x: 0, y: 5 }, { x: 10, y: 5 }, 'building', 'H');
  const vert = createCachedLineEquation('v-1', 'bldg-v', 0, { x: 5, y: 0 }, { x: 5, y: 10 }, 'building', 'V');
  const lineBuffer = [horiz, vert];

  it('snaps to the intersection of two crossing edges within threshold', () => {
    const cursor: Point2D = { x: 5.05, y: 5.05 };
    const context = makeContext({ mouseWorld: cursor, lineBuffer });
    const results = strategy.findAllSnaps(cursor, context);

    expect(results.length).toBe(1);
    expect(results[0].type).toBe('intersection');
    expect(results[0].point.x).toBeCloseTo(5);
    expect(results[0].point.y).toBeCloseTo(5);
  });

  it('returns no snap when fewer than 2 candidate edges are present', () => {
    const cursor: Point2D = { x: 5, y: 5 };
    const context = makeContext({ mouseWorld: cursor, lineBuffer: [horiz] });
    expect(strategy.findAllSnaps(cursor, context)).toEqual([]);
  });

  it('rejects an intersection point far outside both segments (extension tolerance exceeded)', () => {
    // Two nearly-parallel-but-crossing lines whose carrier intersection lands far from either body
    const a = createCachedLineEquation('a-1', 'bldg-a', 0, { x: 0, y: 0 }, { x: 1, y: 0.001 }, 'building', 'A');
    const b = createCachedLineEquation('b-1', 'bldg-b', 0, { x: 0, y: 1 }, { x: 1, y: 1.002 }, 'building', 'B');
    const cursor: Point2D = { x: 0.5, y: 0.5 };
    const context = makeContext({ mouseWorld: cursor, lineBuffer: [a, b] });
    expect(strategy.findAllSnaps(cursor, context)).toEqual([]);
  });

  it('is suppressed by isOsnapActive === false', () => {
    const cursor: Point2D = { x: 5.05, y: 5.05 };
    const context = makeContext({ mouseWorld: cursor, lineBuffer, isOsnapActive: false });
    expect(strategy.findAllSnaps(cursor, context)).toEqual([]);
  });

  it('is suppressed only by the group flag isOsnapActive === false (no per-type gating)', () => {
    const cursor: Point2D = { x: 5.05, y: 5.05 };
    const context = makeContext({
      mouseWorld: cursor,
      lineBuffer,
      isOsnapActive: false,
    });
    expect(strategy.findAllSnaps(cursor, context)).toEqual([]);
  });

  it('produces the same candidates via spatialIndex as via linear scan over lineBuffer', () => {
    const cursor: Point2D = { x: 5.05, y: 5.05 };
    const spatialIndex = new SpatialLineIndex();
    spatialIndex.rebuildIfStale(lineBuffer);

    const linearCtx = makeContext({ mouseWorld: cursor, lineBuffer });
    const spatialCtx = makeContext({ mouseWorld: cursor, lineBuffer, spatialIndex });

    const linearResults = strategy.findAllSnaps(cursor, linearCtx);
    const spatialResults = strategy.findAllSnaps(cursor, spatialCtx);

    expect(spatialResults.map((r) => r.point)).toEqual(linearResults.map((r) => r.point));
  });

  it('sorts multiple candidates by effDistPx ascending', () => {
    // Add a second crossing pair near the first so two intersection candidates fall in range
    const horiz2 = createCachedLineEquation('h-2', 'bldg-h2', 0, { x: 0, y: 5.3 }, { x: 10, y: 5.3 }, 'building', 'H2');
    const cursor: Point2D = { x: 5, y: 5.15 };
    const context = makeContext({ mouseWorld: cursor, lineBuffer: [horiz, vert, horiz2], thresholdPx: 20 });
    const results = strategy.findAllSnaps(cursor, context);

    expect(results.length).toBeGreaterThan(1);
    for (let i = 1; i < results.length; i++) {
      const prev = (results[i - 1].metadata?.effDistPx as number) ?? results[i - 1].screenDistancePx ?? 0;
      const curr = (results[i].metadata?.effDistPx as number) ?? results[i].screenDistancePx ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});
