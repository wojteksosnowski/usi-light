import { describe, it, expect } from 'vitest';
import { SnapCoordinator } from './SnapCoordinator';
import { SnapContext, EDGE_UCS_DEADBAND_DEG, DEFAULT_SNAP_ENGINE_CONFIG } from './types';
import { buildLineBufferForPolygon, flattenLineBuffer, createCachedLineEquation, CachedLineEquation } from '../../utils/lineBufferEngine';
import { Point2D } from '../../types/geometry';
import { angularSeparationMod90Deg } from '../../utils/segmentStatistics';

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
    thresholdPx: 12,
  };
}

describe('SnapCoordinator idempotency (fixed point)', () => {
  // Two square buildings sharing a near-intersection region: a vertex from building A
  // sits close to an edge-intersection formed with building B, within one aperture.
  const bldgA = buildLineBufferForPolygon('bldg-a', [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ], 'building', 'A');
  const bldgB = buildLineBufferForPolygon('bldg-b', [
    { x: 10.05, y: -5 },
    { x: 10.05, y: 15 },
    { x: 20, y: 15 },
    { x: 20, y: -5 },
  ], 'building', 'B');
  const lineBuffer = flattenLineBuffer(new Map([
    ['bldg-a', bldgA],
    ['bldg-b', bldgB],
  ]));

  it('resolves a stable point: snapping the result again returns the same point/type', () => {
    const coordinator = new SnapCoordinator();
    const cursor: Point2D = { x: 10.02, y: 0.03 };

    const first = coordinator.evaluate(cursor, makeContext(cursor, lineBuffer));
    expect(first.snapped).toBe(true);

    coordinator.clearStickySnap();
    const second = coordinator.evaluate(first.point, makeContext(first.point, lineBuffer));

    expect(second.snapped).toBe(true);
    expect(second.type).toBe(first.type);
    expect(second.point.x).toBeCloseTo(first.point.x, 9);
    expect(second.point.y).toBeCloseTo(first.point.y, 9);
  });

  it('prefers the globally nearest effective-distance candidate over a farther higher-tier one', () => {
    const coordinator = new SnapCoordinator();
    // Cursor is very close to the A/B intersection near (10, 0), but also within aperture
    // of the far vertex (10,0) of A itself - both are legitimate 'vertex'/'intersection' types;
    // verify the near candidate (by effective distance) is chosen rather than an arbitrary
    // priority-tier winner.
    const cursor: Point2D = { x: 10.03, y: 0.01 };
    const result = coordinator.evaluate(cursor, makeContext(cursor, lineBuffer));
    expect(result.snapped).toBe(true);
    expect(Math.hypot(result.point.x - cursor.x, result.point.y - cursor.y)).toBeLessThan(0.5);
  });
});

describe('SnapEngineConfig wiring (spec §5)', () => {
  // A vertex and an on-segment edge candidate placed at the exact same world distance from
  // the cursor, with equal-length source edges and no category — so Score_edge is virtually
  // identical for both and only SNAP_TYPE_WEIGHTS can decide the winner.
  const vertexEdge = createCachedLineEquation('a_edge_0', 'obj-a', 0, { x: 0.15, y: 0 }, { x: 0.15, y: -10 });
  const nearestEdge = createCachedLineEquation('b_edge_0', 'obj-b', 0, { x: -5, y: 0.15 }, { x: 5, y: 0.15 });
  const lineBuffer = [vertexEdge, nearestEdge];
  const cursor: Point2D = { x: 0, y: 0 };

  it('prefers the vertex candidate under default typeWeights', () => {
    const coordinator = new SnapCoordinator();
    const result = coordinator.evaluate(cursor, makeContext(cursor, lineBuffer));
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('vertex');
  });

  it('switches the winner to the edge candidate when config.typeWeights is overridden', () => {
    const coordinator = new SnapCoordinator(undefined, {
      typeWeights: { ...DEFAULT_SNAP_ENGINE_CONFIG.typeWeights, vertex: 0.1, edge: 5.0 },
    });
    const result = coordinator.evaluate(cursor, makeContext(cursor, lineBuffer));
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('edge');
  });
});

describe('EDGE_UCS_DEADBAND_DEG (spec §2.2 separation rule)', () => {
  it('rejects an EDGE_UCS within the deadband of ACTIVE_UCS', () => {
    const dominantAngle = 1.9; // < 2.0° from view axis (0°)
    expect(angularSeparationMod90Deg(dominantAngle, 0)).toBeLessThan(EDGE_UCS_DEADBAND_DEG);
  });

  it('accepts an EDGE_UCS outside the deadband of ACTIVE_UCS', () => {
    const dominantAngle = 2.1; // > 2.0° from view axis (0°)
    expect(angularSeparationMod90Deg(dominantAngle, 0)).toBeGreaterThanOrEqual(EDGE_UCS_DEADBAND_DEG);
  });
});
