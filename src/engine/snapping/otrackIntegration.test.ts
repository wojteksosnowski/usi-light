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

function makeContext(mouseWorld: Point2D, lineBuffer: ReturnType<typeof flattenLineBuffer>): SnapContext {
  return {
    mouseWorld,
    mouseScreen: worldToScreen(mouseWorld.x, mouseWorld.y),
    worldToScreen,
    screenToWorld,
    buildings: [],
    lineBuffer,
    isOsnapActive: true,
    // OTRACK dwell-ray snapping (OtrackManager) is gated by the grupowa flaga OTRACK
    // (isDirectionSnappingActive) since Faza C — must be true for otrack_ray/otrack_intersection
    // results to be produced, consistently with DirectionSnapStrategy.
    isDirectionSnappingActive: true,
    thresholdPx: 12,
  };
}

describe('OTRACK integration into SnapCoordinator (previously dead OtrackManager)', () => {
  const bldg = buildLineBufferForPolygon('bldg-a', [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ], 'building', 'A');
  const lineBuffer = flattenLineBuffer(new Map([['bldg-a', bldg]]));

  it('acquires an anchor after dwelling on a vertex, then snaps to its tracking ray', () => {
    const coordinator = new SnapCoordinator();
    const vertex: Point2D = { x: 0, y: 0 };
    let simulatedNow = 1_000_000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => simulatedNow);

    try {
      // Simulate dwell: cursor rests on the vertex for >= dwellThresholdMs (300ms default).
      // SnapCoordinator.evaluate -> OtrackSnapStrategy.findSnap -> OtrackManager.updateDwell
      // drives the acquisition state machine each call.
      coordinator.evaluate(vertex, makeContext(vertex, lineBuffer));
      simulatedNow += 350;
      coordinator.clearStickySnap();
      coordinator.evaluate(vertex, makeContext(vertex, lineBuffer));

      // After acquisition, a cursor further along the horizontal (y=0) tracking ray from (0,0)
      // should resolve to an OTRACK ray snap — this path previously never fired because
      // OtrackManager was never wired into SnapCoordinator/the strategy chain.
      simulatedNow += 50;
      coordinator.clearStickySnap();
      const trackedCursor: Point2D = { x: 5, y: 0.15 };
      const result = coordinator.evaluate(trackedCursor, makeContext(trackedCursor, lineBuffer));

      expect(result.snapped).toBe(true);
      expect(result.type).toBe('otrack_ray');
      expect(result.point.y).toBeCloseTo(0, 9);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
