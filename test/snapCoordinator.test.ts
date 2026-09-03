import { describe, it, expect } from 'vitest';
import { SnapCoordinator, SnapContext } from '../src/utils/snapping/SnapCoordinator';
import { BuildingLoop } from '../src/types/geometry';
import { createCachedLineEquation } from '../src/utils/lineBufferEngine';

describe('SnapCoordinator Pipeline', () => {
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

  it('prioritizes ObjectSnap (endpoint) over GridSnap and DirectionSnap', () => {
    const ctx: SnapContext = {
      mouseWorld: { x: 0.1, y: 0.1 },
      mouseScreen: { sx: 2, sy: 2 },
      worldToScreen,
      screenToWorld,
      buildings: [dummyBuilding],
      lineBuffer,
      acquiredAnchors: [],
      isOsnapActive: true,
      isDirectionSnappingActive: true,
      gridSnapEnabled: true,
      gridSize: 1.0,
      originPoint: { x: 5, y: 5 },
    };

    const result = coordinator.evaluate(ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('endpoint');
    expect(result.point.x).toBeCloseTo(0);
    expect(result.point.y).toBeCloseTo(0);
  });

  it('falls back to GridSnap when Osnap is inactive', () => {
    const ctx: SnapContext = {
      mouseWorld: { x: 3.02, y: 4.01 },
      mouseScreen: { sx: 3.02 * 20, sy: 4.01 * 20 },
      worldToScreen,
      screenToWorld,
      buildings: [dummyBuilding],
      lineBuffer: [],
      acquiredAnchors: [],
      isOsnapActive: false,
      isDirectionSnappingActive: false,
      gridSnapEnabled: true,
      gridSize: 1.0,
    };

    const result = coordinator.evaluate(ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('grid');
    expect(result.point.x).toBe(3.0);
    expect(result.point.y).toBe(4.0);
  });

  it('returns unsnapped point when no snap rule triggers', () => {
    const ctx: SnapContext = {
      mouseWorld: { x: 50.3, y: 40.7 },
      mouseScreen: { sx: 50.3 * 20, sy: 40.7 * 20 },
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: [],
      acquiredAnchors: [],
      isOsnapActive: false,
      isDirectionSnappingActive: false,
      gridSnapEnabled: false,
    };

    const result = coordinator.evaluate(ctx);
    expect(result.snapped).toBe(false);
    expect(result.type).toBe('none');
    expect(result.point.x).toBe(50.3);
    expect(result.point.y).toBe(40.7);
  });
});
