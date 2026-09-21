import { describe, it, expect } from 'vitest';
import { VertexSnapStrategy } from './VertexSnapStrategy';
import { SnapContext } from '../types';
import { buildLineBufferForPolygon, flattenLineBuffer } from '../../../utils/lineBufferEngine';
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

describe('VertexSnapStrategy', () => {
  const strategy = new VertexSnapStrategy();

  const square = buildLineBufferForPolygon('bldg-a', [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ], 'building', 'A');
  const lineBuffer = flattenLineBuffer(new Map([['bldg-a', square]]));

  it('snaps to the nearest vertex within thresholdPx', () => {
    const cursor: Point2D = { x: 0.1, y: 0.1 };
    const context = makeContext({ mouseWorld: cursor, lineBuffer });
    const results = strategy.findAllSnaps(cursor, context);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('vertex');
    expect(results[0].point).toEqual({ x: 0, y: 0 });
  });

  it('returns no snap when cursor is outside the tolerance radius', () => {
    const cursor: Point2D = { x: 5, y: 5 }; // center of square, far from all corners
    const context = makeContext({ mouseWorld: cursor, lineBuffer });
    const results = strategy.findAllSnaps(cursor, context);

    expect(results.length).toBe(0);
  });

  it('deduplicates a vertex shared by two adjacent edges into a single result', () => {
    const cursor: Point2D = { x: 10.05, y: 0.05 }; // near shared corner (10,0)
    const context = makeContext({ mouseWorld: cursor, lineBuffer });
    const results = strategy.findAllSnaps(cursor, context);

    const atCorner = results.filter(
      (r) => Math.abs(r.point.x - 10) < 1e-6 && Math.abs(r.point.y - 0) < 1e-6
    );
    expect(atCorner.length).toBe(1);
  });

  it('is suppressed by isOsnapActive === false', () => {
    const cursor: Point2D = { x: 0.1, y: 0.1 };
    const context = makeContext({ mouseWorld: cursor, lineBuffer, isOsnapActive: false });
    expect(strategy.findAllSnaps(cursor, context)).toEqual([]);
  });

  it('is suppressed only by the group flag isOsnapActive === false (no per-type gating)', () => {
    const cursor: Point2D = { x: 0.1, y: 0.1 };
    const context = makeContext({
      mouseWorld: cursor,
      lineBuffer,
      isOsnapActive: false,
    });
    expect(strategy.findAllSnaps(cursor, context)).toEqual([]);
  });

  it('applies a hover/selected building bonus that lowers effDistPx', () => {
    const cursor: Point2D = { x: 0.2, y: 0.0 };
    const baseCtx = makeContext({ mouseWorld: cursor, lineBuffer });
    const hoveredCtx = makeContext({ mouseWorld: cursor, lineBuffer, hoveredBuildingId: 'bldg-a' });

    const base = strategy.findAllSnaps(cursor, baseCtx)[0];
    const hovered = strategy.findAllSnaps(cursor, hoveredCtx)[0];

    expect((hovered.metadata?.effDistPx as number)).toBeLessThan(base.metadata?.effDistPx as number);
  });

  it('applies hysteresis bonus when previousSnapResult matches by point or sourceBuildingId', () => {
    const cursor: Point2D = { x: 0.3, y: 0.0 }; // slightly further from (0,0) than pure hover test
    const baseCtx = makeContext({ mouseWorld: cursor, lineBuffer });
    const stickyCtx = makeContext({
      mouseWorld: cursor,
      lineBuffer,
      previousSnapResult: {
        point: { x: 0, y: 0 },
        snapped: true,
        type: 'vertex',
        sourceBuildingId: 'bldg-a',
      },
    });

    const base = strategy.findAllSnaps(cursor, baseCtx)[0];
    const sticky = strategy.findAllSnaps(cursor, stickyCtx)[0];

    expect((sticky.metadata?.effDistPx as number)).toBeLessThan(base.metadata?.effDistPx as number);
  });

  it('produces the same candidates via spatialIndex as via linear scan over lineBuffer', () => {
    const cursor: Point2D = { x: 0.1, y: 0.1 };
    const spatialIndex = new SpatialLineIndex();
    spatialIndex.rebuildIfStale(lineBuffer);

    const linearCtx = makeContext({ mouseWorld: cursor, lineBuffer });
    const spatialCtx = makeContext({ mouseWorld: cursor, lineBuffer, spatialIndex });

    const linearResults = strategy.findAllSnaps(cursor, linearCtx);
    const spatialResults = strategy.findAllSnaps(cursor, spatialCtx);

    expect(spatialResults.map((r) => r.point)).toEqual(linearResults.map((r) => r.point));
  });

  it('sorts results by effDistPx ascending', () => {
    // Cursor near the shared area of two corners so multiple vertex candidates are in range
    const cursor: Point2D = { x: 5, y: 0.3 };
    const wideCtx = makeContext({ mouseWorld: cursor, lineBuffer, thresholdPx: 120 });
    const results = strategy.findAllSnaps(cursor, wideCtx);

    expect(results.length).toBeGreaterThan(1);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].metadata?.effDistPx as number).toBeGreaterThanOrEqual(
        results[i - 1].metadata?.effDistPx as number
      );
    }
  });
});
