import { describe, it, expect } from 'vitest';
import { VertexSnapStrategy } from './VertexSnapStrategy';
import { EdgeSnapStrategy } from './EdgeSnapStrategy';
import { SnapContext } from '../types';
import { createCachedLineEquation } from '../../../utils/lineBufferEngine';
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

/**
 * VertexSnapStrategy.ts:78-86 vs EdgeSnapStrategy.ts:86-93 implement hysteresis bonus with
 * DIFFERENT match predicates:
 *  - Vertex: previousSnapResult.type === 'vertex' AND (identical point OR same sourceBuildingId)
 *  - Edge:   previousSnapResult.type is 'edge' OR 'extension' AND same sourceBuildingId (point identity not checked)
 * This test locks in that difference so a future consolidation (strategyHelpers.ts) has to make
 * it an explicit, parametrized decision rather than silently unifying the two conditions.
 */
describe('hysteresis bonus: VertexSnapStrategy vs EdgeSnapStrategy divergent conditions', () => {
  const edge = createCachedLineEquation('e-1', 'bldg-a', 0, { x: 0, y: 0 }, { x: 10, y: 0 }, 'building', 'A');
  const vertexStrategy = new VertexSnapStrategy();
  const edgeStrategy = new EdgeSnapStrategy();

  it('VertexSnapStrategy grants hysteresis bonus on sourceBuildingId match alone (previous type=vertex)', () => {
    const cursor: Point2D = { x: 0.3, y: 0.0 };
    const baseCtx = makeContext({ mouseWorld: cursor, lineBuffer: [edge] });
    const prevBuildingMatchCtx = makeContext({
      mouseWorld: cursor,
      lineBuffer: [edge],
      previousSnapResult: {
        point: { x: 99, y: 99 }, // deliberately NOT the same point
        snapped: true,
        type: 'vertex',
        sourceBuildingId: 'bldg-a',
      },
    });

    const base = vertexStrategy.findAllSnaps(cursor, baseCtx)[0];
    const withPrev = vertexStrategy.findAllSnaps(cursor, prevBuildingMatchCtx)[0];

    expect((withPrev.metadata?.effDistPx as number)).toBeLessThan(base.metadata?.effDistPx as number);
  });

  it('EdgeSnapStrategy grants hysteresis bonus only when previous type is edge/extension AND sourceBuildingId matches', () => {
    const cursor: Point2D = { x: 5, y: 0.3 };
    const baseCtx = makeContext({ mouseWorld: cursor, lineBuffer: [edge] });
    const wrongTypeCtx = makeContext({
      mouseWorld: cursor,
      lineBuffer: [edge],
      previousSnapResult: {
        point: { x: 0, y: 0 },
        snapped: true,
        type: 'vertex', // NOT edge/extension -> Edge strategy must NOT apply bonus
        sourceBuildingId: 'bldg-a',
      },
    });
    const matchingTypeCtx = makeContext({
      mouseWorld: cursor,
      lineBuffer: [edge],
      previousSnapResult: {
        point: { x: 0, y: 0 },
        snapped: true,
        type: 'edge',
        sourceBuildingId: 'bldg-a',
      },
    });

    const base = edgeStrategy.findAllSnaps(cursor, baseCtx)[0];
    const wrongType = edgeStrategy.findAllSnaps(cursor, wrongTypeCtx)[0];
    const matchingType = edgeStrategy.findAllSnaps(cursor, matchingTypeCtx)[0];

    expect(wrongType.metadata?.effDistPx).toBeCloseTo(base.metadata?.effDistPx as number);
    expect((matchingType.metadata?.effDistPx as number)).toBeLessThan(base.metadata?.effDistPx as number);
  });

  it('EdgeSnapStrategy does NOT grant bonus on point-identity alone when sourceBuildingId differs', () => {
    const cursor: Point2D = { x: 5, y: 0.3 };
    const baseCtx = makeContext({ mouseWorld: cursor, lineBuffer: [edge] });
    const differentBuildingCtx = makeContext({
      mouseWorld: cursor,
      lineBuffer: [edge],
      previousSnapResult: {
        point: { x: 5, y: 0 }, // identical point to the projected snap
        snapped: true,
        type: 'edge',
        sourceBuildingId: 'bldg-other', // different building id
      },
    });

    const base = edgeStrategy.findAllSnaps(cursor, baseCtx)[0];
    const differentBuilding = edgeStrategy.findAllSnaps(cursor, differentBuildingCtx)[0];

    expect(differentBuilding.metadata?.effDistPx).toBeCloseTo(base.metadata?.effDistPx as number);
  });
});
