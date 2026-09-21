import { describe, it, expect, vi } from 'vitest';
import { OtrackManager } from './OtrackManager';
import { OtrackSnapStrategy } from './strategies/OtrackSnapStrategy';
import { SnapContext } from './types';
import { Point2D } from '../../types/geometry';

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
    isDirectionSnappingActive: true,
    thresholdPx: 12,
    ...overrides,
  };
}

function acquireAnchor(manager: OtrackManager, vertex: Point2D, buildingId?: string) {
  let now = 1_000_000;
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  try {
    manager.updateDwell(vertex, worldToScreen(vertex.x, vertex.y), buildingId, now);
    now += 350;
    const outcome = manager.updateDwell(vertex, worldToScreen(vertex.x, vertex.y), buildingId, now);
    return outcome;
  } finally {
    nowSpy.mockRestore();
  }
}

describe('OtrackManager.generateTrackingRays', () => {
  it('generates ortho (horizontal+vertical) rays for a single acquired anchor', () => {
    const manager = new OtrackManager();
    const outcome = acquireAnchor(manager, { x: 3, y: 4 });
    expect(outcome.newlyAcquired).toBe(true);

    const context = makeContext({ mouseWorld: { x: 3, y: 4 } });
    const rays = manager.generateTrackingRays(context);

    expect(rays.some((r) => r.type === 'horizontal')).toBe(true);
    expect(rays.some((r) => r.type === 'vertical')).toBe(true);
  });

  it('adds dominant-direction rays when dominantDirections are present and tracking is active', () => {
    const manager = new OtrackManager();
    acquireAnchor(manager, { x: 3, y: 4 });

    const context = makeContext({
      mouseWorld: { x: 3, y: 4 },
      dominantDirections: [{ angleDeg: 30, orthogonalDeg: 120, isTrackingActive: true } as any],
    });
    const rays = manager.generateTrackingRays(context);

    expect(rays.some((r) => r.type === 'parallel' && r.isStatistical)).toBe(true);
    expect(rays.some((r) => r.type === 'perpendicular' && r.isStatistical)).toBe(true);
  });

  it('produces no rays when there are no acquired anchors', () => {
    const manager = new OtrackManager();
    const context = makeContext({ mouseWorld: { x: 3, y: 4 } });
    expect(manager.generateTrackingRays(context)).toEqual([]);
  });
});

// Faza C: naprawiono bug (dawniej udokumentowany tu jako "KNOWN BUG") polegający na tym, że
// OtrackManager.generateTrackingRays ignorowało flagi OTRACK. Gating grupowy jest teraz
// egzekwowany jeden poziom wyżej, w OtrackSnapStrategy.findSnap (SnapContext.isDirectionSnappingActive),
// spójnie z DirectionSnapStrategy — OTRACK jako całość (rays + guide lines) działa razem albo wcale.
describe('OtrackSnapStrategy — grupowa flaga OTRACK gatinguje generowanie promieni', () => {
  it('zwraca null (brak promieni OTRACK) gdy isDirectionSnappingActive === false, mimo zdobytej kotwicy', () => {
    const manager = new OtrackManager();
    acquireAnchor(manager, { x: 3, y: 4 });
    const strategy = new OtrackSnapStrategy(manager);

    const context = makeContext({ mouseWorld: { x: 3.05, y: 4 }, isDirectionSnappingActive: false });
    expect(strategy.findSnap({ x: 3.05, y: 4 }, context)).toBeNull();
  });

  it('zwraca null gdy isOsnapActive === false, nawet przy isDirectionSnappingActive === true', () => {
    const manager = new OtrackManager();
    acquireAnchor(manager, { x: 3, y: 4 });
    const strategy = new OtrackSnapStrategy(manager);

    const context = makeContext({ mouseWorld: { x: 3.05, y: 4 }, isOsnapActive: false, isDirectionSnappingActive: true });
    expect(strategy.findSnap({ x: 3.05, y: 4 }, context)).toBeNull();
  });

  it('snapuje do promienia OTRACK gdy zarówno isOsnapActive jak i isDirectionSnappingActive są true', () => {
    const manager = new OtrackManager();
    acquireAnchor(manager, { x: 3, y: 4 });
    const strategy = new OtrackSnapStrategy(manager);

    const context = makeContext({ mouseWorld: { x: 3.05, y: 4 }, isOsnapActive: true, isDirectionSnappingActive: true });
    const result = strategy.findSnap({ x: 3.05, y: 4 }, context);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('otrack_ray');
  });
});

describe('OtrackManager.evaluateOtrackSnap — dual-anchor intersection', () => {
  it('snaps to the intersection point of two anchors ortho rays', () => {
    const manager = new OtrackManager();
    acquireAnchor(manager, { x: 0, y: 0 }, 'bldg-a');
    // second dwell must be far enough (>6px screen or >0.05m world) from first to register as a new candidate
    acquireAnchor(manager, { x: 5, y: 5 }, 'bldg-b');

    expect(manager.getAnchors().length).toBe(2);

    // Vertical ray from (0,0) is x=0; horizontal ray from (5,5) is y=5 -> intersection (0,5)
    const cursor: Point2D = { x: 0.05, y: 5.05 };
    const context = makeContext({ mouseWorld: cursor });
    const result = manager.evaluateOtrackSnap(cursor, context);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('otrack_intersection');
    expect(result?.point.x).toBeCloseTo(0);
    expect(result?.point.y).toBeCloseTo(5);
  });
});

describe('OtrackManager.clearAnchors / clearOtrackAnchors state reset', () => {
  it('removes all acquired anchors and produces no rays afterwards', () => {
    const manager = new OtrackManager();
    acquireAnchor(manager, { x: 3, y: 4 });
    expect(manager.getAnchors().length).toBe(1);

    manager.clearAnchors();
    expect(manager.getAnchors().length).toBe(0);

    const context = makeContext({ mouseWorld: { x: 3, y: 4 } });
    expect(manager.generateTrackingRays(context)).toEqual([]);
    expect(manager.evaluateOtrackSnap({ x: 3, y: 4 }, context)).toBeNull();
  });
});
