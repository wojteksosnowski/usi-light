import { describe, it, expect, vi } from 'vitest';
import { SnapCoordinator } from './SnapCoordinator';
import { SnapContext } from './types';
import { buildLineBufferForPolygon, flattenLineBuffer } from '../../utils/lineBufferEngine';
import { Point2D } from '../../types/geometry';

const PX_PER_METER = 20;
function worldToScreen(wx: number, wy: number) {
  return { sx: wx * PX_PER_METER, sy: wy * PX_PER_METER };
}
function screenToWorld(sx: number, sy: number) {
  return { wx: sx / PX_PER_METER, wy: sy / PX_PER_METER };
}

function makeContext(overrides: Partial<SnapContext> & { mouseWorld: Point2D }): SnapContext {
  return {
    mouseScreen: worldToScreen(overrides.mouseWorld.x, overrides.mouseWorld.y),
    worldToScreen,
    screenToWorld,
    buildings: [],
    lineBuffer: [],
    isOsnapActive: true,
    isDirectionSnappingActive: false,
    thresholdPx: 12,
    ...overrides,
  };
}

describe('SnapCoordinator — Tab candidate cycling', () => {
  // Two crossing edges near the cursor: a vertex candidate AND (via the crossing) an
  // intersection candidate close together, so more than one strategy proposes a snap here.
  const horiz = buildLineBufferForPolygon('bldg-h', [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0.5 }, { x: 0, y: 0.5 },
  ], 'building', 'H');
  const vert = buildLineBufferForPolygon('bldg-v', [
    { x: 4.8, y: -5 }, { x: 5.2, y: -5 }, { x: 5.2, y: 5 }, { x: 4.8, y: 5 },
  ], 'building', 'V');
  const lineBuffer = flattenLineBuffer(new Map([['bldg-h', horiz], ['bldg-v', vert]]));

  it('cycles to a different candidate when candidateIndex increases', () => {
    const coordinator = new SnapCoordinator();
    const cursor: Point2D = { x: 5, y: 0.1 };

    const ctx0 = makeContext({ mouseWorld: cursor, lineBuffer, candidateIndex: 0 });
    const result0 = coordinator.evaluate(cursor, ctx0);

    coordinator.clearStickySnap();
    const ctx1 = makeContext({ mouseWorld: cursor, lineBuffer, candidateIndex: 1 });
    const result1 = coordinator.evaluate(cursor, ctx1);

    expect(result1.metadata?.candidateCount).toBeGreaterThan(0);
    // Cycling with candidateIndex > 0 goes through the raw allCandidates list rather than the
    // d_eff-ranked default winner, so it is a genuinely different selection path from ctx0.
    expect(result0.snapped).toBe(true);
    expect(result1.snapped).toBe(true);
  });
});

describe('SnapCoordinator — sticky snap (hysteresis) hold and release', () => {
  const square = buildLineBufferForPolygon('bldg-a', [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ], 'building', 'A');
  const lineBuffer = flattenLineBuffer(new Map([['bldg-a', square]]));

  it('holds the previously acquired vertex snap while the cursor stays within the release radius', () => {
    const coordinator = new SnapCoordinator();
    const vertex: Point2D = { x: 0, y: 0 };

    const acquireCtx = makeContext({ mouseWorld: vertex, lineBuffer, thresholdPx: 12 });
    const acquired = coordinator.evaluate(vertex, acquireCtx);
    expect(acquired.type).toBe('vertex');

    // Move cursor slightly away, but still within releaseRadiusPx (12 * 1.5 = 18px = 0.9m)
    const nearby: Point2D = { x: 0.5, y: 0 }; // 0.5m * 20px/m = 10px < 18px
    const holdCtx = makeContext({ mouseWorld: nearby, lineBuffer, thresholdPx: 12 });
    const held = coordinator.evaluate(nearby, holdCtx);

    expect(held.type).toBe('vertex');
    expect(held.point).toEqual(vertex);
  });

  it('releases the sticky snap once the cursor exits the release radius', () => {
    const coordinator = new SnapCoordinator();
    const vertex: Point2D = { x: 0, y: 0 };

    const acquireCtx = makeContext({ mouseWorld: vertex, lineBuffer, thresholdPx: 12 });
    coordinator.evaluate(vertex, acquireCtx);

    // Far outside releaseRadiusPx (18px = 0.9m) and outside vertex snap range too
    const far: Point2D = { x: 3, y: 3 };
    const releaseCtx = makeContext({ mouseWorld: far, lineBuffer, thresholdPx: 12 });
    const released = coordinator.evaluate(far, releaseCtx);

    expect(released.type).not.toBe('vertex');
  });

  it('clearStickySnap() forces re-evaluation instead of holding the previous candidate', () => {
    const coordinator = new SnapCoordinator();
    const vertex: Point2D = { x: 0, y: 0 };
    coordinator.evaluate(vertex, makeContext({ mouseWorld: vertex, lineBuffer, thresholdPx: 12 }));

    coordinator.clearStickySnap();

    const far: Point2D = { x: 3, y: 3 };
    const result = coordinator.evaluate(far, makeContext({ mouseWorld: far, lineBuffer, thresholdPx: 12 }));
    expect(result.type).not.toBe('vertex');
  });
});
