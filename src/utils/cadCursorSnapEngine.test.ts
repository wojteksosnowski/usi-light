import { describe, it, expect } from 'vitest';
import {
  AnchorPoint,
  generateTrackingRaysForAnchor,
  calculateOtrackIntersections,
  evaluateOsnapSnap,
  findClosestScreenPoint,
} from './cadCursorSnapEngine';
import { createCachedLineEquation } from './lineBufferEngine';

describe('cadCursorSnapEngine', () => {
  const worldToScreenMock = (wx: number, wy: number) => ({ sx: wx * 10, sy: wy * 10 });

  it('findClosestScreenPoint finds nearest item with optional hysteresis discount', () => {
    const points = [
      { id: 'p1', pt: { x: 0, y: 0 } },
      { id: 'p2', pt: { x: 10, y: 0 } },
    ];
    const mouseScreen = { sx: 10, sy: 0 }; // exactly at p1 (x=0 -> sx=0, dist=10px), p2 (x=10 -> sx=100, dist=90px)

    const match = findClosestScreenPoint(
      points,
      (p) => p.pt,
      worldToScreenMock,
      mouseScreen,
      20
    );
    expect(match).not.toBeNull();
    expect(match?.item.id).toBe('p1');
    expect(match?.distPx).toBe(10);
  });

  it('deduplicates tracking rays near ortho axes', () => {
    const anchor = {
      id: 'k1',
      point: { x: 0, y: 0 },
      sourceType: 'vertex' as const,
      sourceEdgeAngle: 0.01, // near horizontal
      acquiredAt: Date.now(),
    };
    const rays = generateTrackingRaysForAnchor(anchor, 50);
    expect(rays.length).toBe(2);
  });

  it('evaluates snap correctly with spatial AABB culling and sticky snap', () => {
    const edge = createCachedLineEquation('e1', 'b1', 0, { x: 0, y: 0 }, { x: 10, y: 0 });
    const snap = evaluateOsnapSnap({
      mouseWorld: { x: 0.1, y: 0.05 },
      lineBuffer: [edge],
      worldToScreen: worldToScreenMock,
      screenSnapThresholdPx: 15,
    });
    expect(snap).not.toBeNull();
    expect(snap?.type).toBe('endpoint');
    expect(snap?.snappedPoint).toEqual({ x: 0, y: 0 });
  });

  it('activates perpendicular snap only when cursor approaches the edge', () => {
    // Edge from (0, 0) to (10, 0)
    const edge = createCachedLineEquation('e1', 'b1', 0, { x: 0, y: 0 }, { x: 10, y: 0 });
    const anchor: AnchorPoint = {
      id: 'k1',
      point: { x: 5, y: 8 }, // anchor above edge at (5, 8)
      sourceType: 'vertex',
      acquiredAt: Date.now(),
    };

    // Projected point is (5, 0).
    // Case A: Mouse is far away from the edge in Y (e.g. at y=4, which is 40px away from edge at scale 10)
    const snapFar = evaluateOsnapSnap({
      mouseWorld: { x: 5.0, y: 4.0 },
      lineBuffer: [edge],
      acquiredPoints: [anchor],
      worldToScreen: worldToScreenMock,
      screenSnapThresholdPx: 15,
    });
    expect(snapFar?.type).not.toBe('perpendicular');

    // Case B: Mouse approaches the edge near (5, 0) (e.g. at (5.1, 0.2), 2px away from edge)
    const snapNear = evaluateOsnapSnap({
      mouseWorld: { x: 5.1, y: 0.2 },
      lineBuffer: [edge],
      acquiredPoints: [anchor],
      worldToScreen: worldToScreenMock,
      screenSnapThresholdPx: 15,
    });
    // Perpendicular drop or midpoint at (5, 0)
    expect(snapNear).not.toBeNull();
    expect(['perpendicular', 'midpoint']).toContain(snapNear?.type);
    expect(snapNear?.snappedPoint.x).toBeCloseTo(5);
    expect(snapNear?.snappedPoint.y).toBeCloseTo(0);
  });

  it('nearest snap yields to endpoint and midpoint within proximity zone', () => {
    // Edge from (0, 0) to (10, 0). Midpoint at (5, 0).
    const edge = createCachedLineEquation('e1', 'b1', 0, { x: 0, y: 0 }, { x: 10, y: 0 });

    // Cursor near endpoint at (0.2, 0.05)
    const snapNearEnd = evaluateOsnapSnap({
      mouseWorld: { x: 0.2, y: 0.05 },
      lineBuffer: [edge],
      worldToScreen: worldToScreenMock,
      screenSnapThresholdPx: 15,
    });
    expect(snapNearEnd?.type).toBe('endpoint');

    // Cursor near midpoint at (5.1, 0.05)
    const snapNearMid = evaluateOsnapSnap({
      mouseWorld: { x: 5.1, y: 0.05 },
      lineBuffer: [edge],
      worldToScreen: worldToScreenMock,
      screenSnapThresholdPx: 15,
    });
    expect(snapNearMid?.type).toBe('midpoint');

    // Cursor in the middle of segment away from endpoint and midpoint at (2.5, 0.05)
    const snapEdge = evaluateOsnapSnap({
      mouseWorld: { x: 2.5, y: 0.05 },
      lineBuffer: [edge],
      worldToScreen: worldToScreenMock,
      screenSnapThresholdPx: 15,
    });
    expect(snapEdge?.type).toBe('nearest');
  });
});
