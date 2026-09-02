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
});
