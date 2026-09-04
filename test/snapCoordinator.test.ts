import { describe, it, expect } from 'vitest';
import {
  SnapCoordinator,
  SnapContext,
  VertexSnapStrategy,
  MidpointSnapStrategy,
  EdgeSnapStrategy,
  DirectionSnapStrategy,
  GridSnapStrategy,
  evaluateBuildingDragMultiSnap,
  evaluateCollinearAndParallelLock,
} from '../src/engine/snapping';
import { BuildingLoop, Point2D } from '../src/types/geometry';
import { createCachedLineEquation } from '../src/utils/lineBufferEngine';

describe('SnapCoordinator & Strategies Pipeline', () => {
  const coordinator = new SnapCoordinator();

  const dummyBuilding: BuildingLoop = {
    id: 'b1',
    name: 'Building 1',
    layer: '0',
    isTested: false,
    defaultHeight: 15,
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    segments: [],
    isClockwise: false,
  };

  const lineBuffer = [
    createCachedLineEquation('b1_0', 'b1', 0, { x: 0, y: 0 }, { x: 10, y: 0 }),
    createCachedLineEquation('b1_1', 'b1', 1, { x: 10, y: 0 }, { x: 10, y: 10 }),
    createCachedLineEquation('b1_2', 'b1', 2, { x: 10, y: 10 }, { x: 0, y: 10 }),
    createCachedLineEquation('b1_3', 'b1', 3, { x: 0, y: 10 }, { x: 0, y: 0 }),
  ];

  const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 20, sy: wy * 20 });
  const screenToWorld = (sx: number, sy: number) => ({ wx: sx / 20, wy: sy / 20 });

  it('prioritizes VertexSnap (endpoint) over GridSnap and DirectionSnap', () => {
    const mouse: Point2D = { x: 0.1, y: 0.1 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 2, sy: 2 },
      worldToScreen,
      screenToWorld,
      buildings: [dummyBuilding],
      lineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: true,
      gridSnapEnabled: true,
      gridSize: 1.0,
      originPoint: { x: 5, y: 5 },
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('vertex');
    expect(result.point.x).toBeCloseTo(0);
    expect(result.point.y).toBeCloseTo(0);
  });

  it('detects MidpointSnap correctly when hovering near the center of an edge', () => {
    // Center of edge (0,0)->(10,0) is (5, 0)
    const mouse: Point2D = { x: 5.05, y: 0.05 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 5.05 * 20, sy: 0.05 * 20 },
      worldToScreen,
      screenToWorld,
      buildings: [dummyBuilding],
      lineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      gridSnapEnabled: false,
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('midpoint');
    expect(result.point.x).toBeCloseTo(5);
    expect(result.point.y).toBeCloseTo(0);
  });

  it('detects EdgeSnap (nearest) when cursor is on edge away from vertices and midpoint', () => {
    // Point on edge at x=2.5, y=0.05 (away from 0, 5, 10)
    const mouse: Point2D = { x: 2.5, y: 0.05 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 2.5 * 20, sy: 0.05 * 20 },
      worldToScreen,
      screenToWorld,
      buildings: [dummyBuilding],
      lineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      gridSnapEnabled: false,
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('edge');
    expect(result.point.x).toBeCloseTo(2.5);
    expect(result.point.y).toBeCloseTo(0);
  });

  it('snaps to Direction (ortho / parallel) when osnap does not hit', () => {
    const origin: Point2D = { x: 0, y: 0 };
    const mouse: Point2D = { x: 10, y: 0.1 }; // close to 0 deg axis
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 200, sy: 2 },
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: [],
      isOsnapActive: false,
      isDirectionSnappingActive: true,
      originPoint: origin,
      dominantDirections: [{ angleDeg: 0, orthogonalDeg: 90, totalLength: 100, percentage: 100 }],
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('direction');
    expect(result.point.y).toBeCloseTo(0, 1);
  });

  it('falls back to GridSnap when Osnap and Direction are inactive', () => {
    const mouse: Point2D = { x: 3.02, y: 4.01 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 3.02 * 20, sy: 4.01 * 20 },
      worldToScreen,
      screenToWorld,
      buildings: [dummyBuilding],
      lineBuffer: [],
      isOsnapActive: false,
      isDirectionSnappingActive: false,
      gridSnapEnabled: true,
      gridSize: 1.0,
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('grid');
    expect(result.point.x).toBe(3.0);
    expect(result.point.y).toBe(4.0);
  });

  it('returns unsnapped point when no snap rule triggers', () => {
    const mouse: Point2D = { x: 50.3, y: 40.7 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 50.3 * 20, sy: 40.7 * 20 },
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: [],
      isOsnapActive: false,
      isDirectionSnappingActive: false,
      gridSnapEnabled: false,
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(false);
    expect(result.type).toBe('none');
    expect(result.point.x).toBe(50.3);
    expect(result.point.y).toBe(40.7);
  });

  it('allows registering and unregistering custom strategies', () => {
    const coord = new SnapCoordinator([]);
    expect(coord.getStrategies().length).toBe(0);

    const customStrat = {
      name: 'CustomAlwaysSnapOrigin',
      priority: 1,
      findSnap: () => ({
        point: { x: 0, y: 0 },
        snapped: true,
        type: 'vertex' as const,
      }),
    };

    coord.registerStrategy(customStrat);
    expect(coord.getStrategies().length).toBe(1);

    const res = coord.evaluate({ x: 99, y: 99 }, {
      mouseWorld: { x: 99, y: 99 },
      mouseScreen: { sx: 0, sy: 0 },
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: [],
      isOsnapActive: true,
      isDirectionSnappingActive: false,
    });
    expect(res.point).toEqual({ x: 0, y: 0 });

    coord.unregisterStrategy('CustomAlwaysSnapOrigin');
    expect(coord.getStrategies().length).toBe(0);
  });

  it('verifies objectDragSnap functions properly', () => {
    const refEdge = createCachedLineEquation('ref1', 'b_ref', 0, { x: 0, y: 0 }, { x: 10, y: 0 });
    const dragEdge = createCachedLineEquation('drag1', 'b_drag', 0, { x: 5, y: 0.05 }, { x: 15, y: 0.05 });
    const lock = evaluateCollinearAndParallelLock(dragEdge, [refEdge], 0.05, 0.2);
    expect(lock?.isParallel).toBe(true);
    expect(lock?.isCollinear).toBe(true);

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
