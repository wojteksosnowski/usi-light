import { describe, it, expect } from 'vitest';
import { EdgeSnapStrategy } from './strategies/EdgeSnapStrategy';
import { SnapContext } from './types';
import { createCachedLineEquation } from '../../utils/lineBufferEngine';
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
    isDirectionSnappingActive: false,
    thresholdPx: 12,
    ...overrides,
  };
}

/**
 * Faza C usunęła per-typu OSNAP toggling (OsnapModes/activeSnapTypes) z engine i store —
 * OSNAP jest teraz wyłącznie grupową flagą (SnapContext.isOsnapActive). To naturalnie
 * eliminuje dawny dead-key bug (store's OsnapModes.edge nie było czytane przez
 * EdgeSnapStrategy, który sprawdzał tylko `nearest`/`extension`) — nie ma już per-typu klucza
 * do pomylenia. Ten test zastępuje osnapDeadKeyEdge.test.ts z Fazy A, które dokumentowało bug.
 */
describe('OSNAP: brak per-typu gatingu po Fazie C (dead-key bug strukturalnie wyeliminowany)', () => {
  const strategy = new EdgeSnapStrategy();
  const edge = createCachedLineEquation('e-1', 'bldg-a', 0, { x: 0, y: 0 }, { x: 10, y: 0 }, 'building', 'A');

  it('zwraca snap na krawędzi gdy isOsnapActive === true', () => {
    const cursor: Point2D = { x: 5, y: 0.1 };
    const context = makeContext({ mouseWorld: cursor, lineBuffer: [edge], isOsnapActive: true });

    const results = strategy.findAllSnaps(cursor, context);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('edge');
  });

  it('jest w pełni wyłączony gdy grupowa flaga isOsnapActive === false', () => {
    const cursor: Point2D = { x: 5, y: 0.1 };
    const context = makeContext({ mouseWorld: cursor, lineBuffer: [edge], isOsnapActive: false });

    const results = strategy.findAllSnaps(cursor, context);
    expect(results.length).toBe(0);
  });

  it('SnapContext nie ma już pola activeSnapTypes (usunięte razem z per-typu gatingiem)', () => {
    const cursor: Point2D = { x: 5, y: 0.1 };
    const context = makeContext({ mouseWorld: cursor, lineBuffer: [edge] }) as unknown as Record<string, unknown>;
    expect(context.activeSnapTypes).toBeUndefined();
  });
});
