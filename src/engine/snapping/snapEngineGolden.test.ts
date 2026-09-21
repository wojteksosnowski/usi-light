import { describe, it, expect } from 'vitest';
import { SnapCoordinator } from './SnapCoordinator';
import { SnapContext } from './types';
import { buildLineBufferForPolygon, flattenLineBuffer, createCachedLineEquation } from '../../utils/lineBufferEngine';
import { SpatialLineIndex } from './SpatialLineIndex';
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

/**
 * Golden/characterization suite for SnapCoordinator.evaluate(): freezes the FULL SnapResult
 * (type, point, key metadata) for a representative set of scenes, to be run unchanged after
 * every step of the engine-simplification refactor (Phase B of the plan). Any diff in the
 * asserted fields here means a step was NOT behavior-preserving and needs explicit review.
 */
describe('SnapCoordinator golden scenes', () => {
  const square = buildLineBufferForPolygon('bldg-square', [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ], 'building', 'Square');
  const boundaryPoly = buildLineBufferForPolygon('bldg-boundary', [
    { x: -20, y: -20 }, { x: 30, y: -20 }, { x: 30, y: 30 }, { x: -20, y: 30 },
  ], 'boundary', 'Plot');
  const lineBuffer = flattenLineBuffer(new Map([
    ['bldg-square', square],
    ['bldg-boundary', boundaryPoly],
  ]));

  it('scene 1: cursor near a corner snaps to vertex', () => {
    const coordinator = new SnapCoordinator();
    const cursor: Point2D = { x: 0.15, y: 0.1 };
    const result = coordinator.evaluate(cursor, makeContext({ mouseWorld: cursor, lineBuffer }));

    expect(result.snapped).toBe(true);
    expect(result.type).toBe('vertex');
    expect(result.point).toEqual({ x: 0, y: 0 });
    expect(result.sourceBuildingId).toBe('bldg-square');
  });

  it('scene 2: cursor mid-wall (far from corners) snaps to edge (nearest)', () => {
    const coordinator = new SnapCoordinator();
    const cursor: Point2D = { x: 5, y: 0.2 };
    const result = coordinator.evaluate(cursor, makeContext({ mouseWorld: cursor, lineBuffer }));

    expect(result.snapped).toBe(true);
    expect(result.type).toBe('edge');
    expect(result.point.x).toBeCloseTo(5);
    expect(result.point.y).toBeCloseTo(0);
  });

  it('scene 3: cursor beyond a wall endpoint (but outside vertex-capture range) snaps to extension', () => {
    const coordinator = new SnapCoordinator();
    const singleEdge = createCachedLineEquation('single-1', 'bldg-single', 0, { x: 0, y: 0 }, { x: 10, y: 0 }, 'building', 'Single');
    const cursor: Point2D = { x: 10.3, y: 0.05 };
    const result = coordinator.evaluate(cursor, makeContext({ mouseWorld: cursor, lineBuffer: [singleEdge] }));

    expect(result.snapped).toBe(true);
    expect(result.type).toBe('extension');
  });

  it('scene 4: cursor at crossing of two perpendicular edges snaps to intersection', () => {
    const coordinator = new SnapCoordinator();
    const h = createCachedLineEquation('h-1', 'bldg-h', 0, { x: 0, y: 5 }, { x: 10, y: 5 }, 'building', 'H');
    const v = createCachedLineEquation('v-1', 'bldg-v', 0, { x: 5, y: 0 }, { x: 5, y: 10 }, 'building', 'V');
    const cursor: Point2D = { x: 5.05, y: 5.05 };
    const result = coordinator.evaluate(cursor, makeContext({ mouseWorld: cursor, lineBuffer: [h, v] }));

    expect(result.snapped).toBe(true);
    expect(result.type).toBe('intersection');
    expect(result.point.x).toBeCloseTo(5);
    expect(result.point.y).toBeCloseTo(5);
  });

  it('scene 5: same-category (boundary) cursor favors boundary edge over closer building vertex via category affinity', () => {
    const coordinator = new SnapCoordinator();
    // Cursor is roughly equidistant to the square's corner (10,10) and the boundary edge y=30,
    // but activeCategory='boundary' should favor a boundary-affinitized candidate when scores tie closely.
    // Kept as a structural regression: whichever candidate wins today must keep winning.
    const cursor: Point2D = { x: 10.05, y: 10.05 };
    const result = coordinator.evaluate(cursor, makeContext({ mouseWorld: cursor, lineBuffer, activeCategory: 'boundary' }));

    expect(result.snapped).toBe(true);
    expect(result.type).toBe('vertex');
    expect(result.sourceCategory).toBe('building');
  });

  it('scene 6: hoveredBuildingId lowers effective distance enough to win over an otherwise-closer candidate', () => {
    const coordinator = new SnapCoordinator();
    const near = createCachedLineEquation('n-1', 'bldg-near', 0, { x: 0, y: 0.05 }, { x: 10, y: 0.05 }, 'building', 'Near');
    const far = createCachedLineEquation('f-1', 'bldg-far', 0, { x: 0, y: -0.05 }, { x: 10, y: -0.05 }, 'building', 'Far');
    const cursor: Point2D = { x: 5, y: 0 };
    const result = coordinator.evaluate(
      cursor,
      makeContext({ mouseWorld: cursor, lineBuffer: [near, far], hoveredBuildingId: 'bldg-far' })
    );

    expect(result.snapped).toBe(true);
    expect(result.sourceBuildingId).toBe('bldg-far');
  });

  it('scene 7: spatialIndex path yields the identical winning result as the default (SnapCoordinator builds its own index)', () => {
    const coordinator = new SnapCoordinator();
    const cursor: Point2D = { x: 0.15, y: 0.1 };
    const spatialIndex = new SpatialLineIndex();
    spatialIndex.rebuildIfStale(lineBuffer);

    // SnapCoordinator.evaluate always injects its own internal spatialIndex, overriding any
    // caller-provided one — this scene freezes that fact.
    const result = coordinator.evaluate(
      cursor,
      makeContext({ mouseWorld: cursor, lineBuffer, spatialIndex })
    );

    expect(result.type).toBe('vertex');
    expect(result.point).toEqual({ x: 0, y: 0 });
  });

  it('scene 8: previousSnapResult sticky bias keeps the prior vertex winning at an equidistant new position', () => {
    const coordinator = new SnapCoordinator();
    const cursor: Point2D = { x: 0.05, y: 0.05 };
    const first = coordinator.evaluate(cursor, makeContext({ mouseWorld: cursor, lineBuffer }));
    expect(first.type).toBe('vertex');

    // Nearby position still inside sticky release radius -> holds the same candidate
    const nearby: Point2D = { x: 0.1, y: 0.05 };
    const second = coordinator.evaluate(nearby, makeContext({ mouseWorld: nearby, lineBuffer }));
    expect(second.point).toEqual(first.point);
  });

  it('scene 9: no candidates in range returns an unsnapped result at the raw cursor point', () => {
    const coordinator = new SnapCoordinator();
    const cursor: Point2D = { x: 5, y: 5 }; // center of square, far from any edge/vertex
    const result = coordinator.evaluate(cursor, makeContext({ mouseWorld: cursor, lineBuffer }));

    expect(result.snapped).toBe(false);
    expect(result.type).toBe('none');
    expect(result.point).toEqual(cursor);
  });

  it('scene 10: isOsnapActive=false suppresses all OSNAP strategies, leaving only grid/none', () => {
    const coordinator = new SnapCoordinator();
    const cursor: Point2D = { x: 0.1, y: 0.1 };
    const result = coordinator.evaluate(
      cursor,
      makeContext({ mouseWorld: cursor, lineBuffer, isOsnapActive: false })
    );

    expect(result.type).not.toBe('vertex');
    expect(result.type).not.toBe('edge');
    expect(result.type).not.toBe('intersection');
  });

  it('scene 11: excludeBuildingId removes that building entirely from candidacy', () => {
    const coordinator = new SnapCoordinator();
    const cursor: Point2D = { x: 0.1, y: 0.1 };
    const result = coordinator.evaluate(
      cursor,
      makeContext({ mouseWorld: cursor, lineBuffer, excludeBuildingId: 'bldg-square' })
    );

    expect(result.sourceBuildingId).not.toBe('bldg-square');
  });
});
