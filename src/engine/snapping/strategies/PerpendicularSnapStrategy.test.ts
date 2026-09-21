import { describe, it, expect } from 'vitest';
import { PerpendicularSnapStrategy } from './PerpendicularSnapStrategy';
import { SnapContext } from '../types';
import { buildLineBufferForPolygon, flattenLineBuffer } from '../../../utils/lineBufferEngine';
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

describe('PerpendicularSnapStrategy — regression: far "extension" false positives', () => {
  const strategy = new PerpendicularSnapStrategy();

  it('rejects a perpendicular-to-extension hit whose real segment body is far away', () => {
    // A short, distant wall whose infinite carrier line happens to pass close to the cursor,
    // but whose actual body is many meters away from that projection point.
    const farWall = buildLineBufferForPolygon('far-wall', [
      { x: 100, y: 100 },
      { x: 101, y: 100 },
      { x: 101, y: 101 },
      { x: 100, y: 101 },
    ], 'building', 'Far');
    const lineBuffer = flattenLineBuffer(new Map([['far-wall', farWall]]));

    const origin: Point2D = { x: 0, y: 0 };
    const cursor: Point2D = { x: 0, y: 100.4 }; // perpendicular from origin onto y=100 carrier line

    const context = makeContext({ mouseWorld: cursor, lineBuffer, originPoint: origin });
    const results = strategy.findAllSnaps(cursor, context);

    expect(results.length).toBe(0);
  });

  it('accepts a perpendicular-to-extension hit close to the real segment', () => {
    const nearWall = buildLineBufferForPolygon('near-wall', [
      { x: -1, y: 5 },
      { x: 1, y: 5 },
      { x: 1, y: 6 },
      { x: -1, y: 6 },
    ], 'building', 'Near');
    const lineBuffer = flattenLineBuffer(new Map([['near-wall', nearWall]]));

    // Origin chosen so its projection onto the y=5 edge (x in [-1,1]) lands just 0.3m beyond
    // the segment's real end — a short, legitimate extension, unlike the far-away test above.
    const origin: Point2D = { x: 1.3, y: 0 };
    const cursor: Point2D = { x: 1.3, y: 5 };

    const context = makeContext({ mouseWorld: cursor, lineBuffer, originPoint: origin });
    const results = strategy.findAllSnaps(cursor, context);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].metadata?.isOnSegment).toBe(false);
  });
});
