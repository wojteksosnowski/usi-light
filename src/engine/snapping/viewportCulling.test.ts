import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SnapCoordinator } from './SnapCoordinator';
import { SnapContext } from './types';
import { buildLineBufferFromBuildings, flattenLineBuffer, CachedLineEquation } from '../../utils/lineBufferEngine';
import { viewportWorldBounds, edgeIntersectsScreenRect } from '../../components/cad/masterplan/masterplanSpatial';
import { BuildingLoop, Point2D } from '../../types/geometry';

const warszawaPath = path.resolve(__dirname, '../../../reference/warszawa.json');

/** Mirrors the production world<->screen transform used by useCanvasInteraction.ts (uniform scale, no rotation). */
function makeTransforms(pxPerMeter: number, centerWorld: Point2D, width: number, height: number) {
  const worldToScreen = (wx: number, wy: number) => ({
    sx: (wx - centerWorld.x) * pxPerMeter + width / 2,
    sy: (wy - centerWorld.y) * pxPerMeter + height / 2,
  });
  const screenToWorld = (sx: number, sy: number) => ({
    wx: (sx - width / 2) / pxPerMeter + centerWorld.x,
    wy: (sy - height / 2) / pxPerMeter + centerWorld.y,
  });
  return { worldToScreen, screenToWorld };
}

/** Exactly the two-filter pipeline useCanvasInteraction.ts:476-486 uses to derive visibleLineBuffer. */
function computeVisibleLineBuffer(
  lineBuffer: CachedLineEquation[],
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
  screenToWorld: (sx: number, sy: number) => { wx: number; wy: number },
  width: number,
  height: number
): CachedLineEquation[] {
  const vp = viewportWorldBounds({ width, height, screenToWorld }, 0);
  return lineBuffer
    .filter((edge) => {
      const eMinX = Math.min(edge.p1.x, edge.p2.x);
      const eMaxX = Math.max(edge.p1.x, edge.p2.x);
      const eMinY = Math.min(edge.p1.y, edge.p2.y);
      const eMaxY = Math.max(edge.p1.y, edge.p2.y);
      return eMaxX >= vp.minX && eMinX <= vp.maxX && eMaxY >= vp.minY && eMinY <= vp.maxY;
    })
    .filter((edge) => edgeIntersectsScreenRect(edge.p1, edge.p2, worldToScreen, width, height, 0));
}

describe('SNAP viewport culling (visibleLineBuffer contract)', () => {
  if (!fs.existsSync(warszawaPath)) {
    it.skip('reference/warszawa.json not found — skipping', () => {});
    return;
  }

  const rawData = JSON.parse(fs.readFileSync(warszawaPath, 'utf-8'));
  const buildings: BuildingLoop[] = rawData.buildings || [];

  const fullLineBuffer = flattenLineBuffer(buildLineBufferFromBuildings(buildings, {}));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const edge of fullLineBuffer) {
    minX = Math.min(minX, edge.p1.x, edge.p2.x);
    maxX = Math.max(maxX, edge.p1.x, edge.p2.x);
    minY = Math.min(minY, edge.p1.y, edge.p2.y);
    maxY = Math.max(maxY, edge.p1.y, edge.p2.y);
  }
  const sceneCenter: Point2D = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const sceneWidth = maxX - minX;
  const sceneHeight = maxY - minY;

  const WIDTH = 1200;
  const HEIGHT = 800;
  // ~40m x 27m window — a small fraction of the ~1296m x 1066m scene.
  const pxPerMeter = WIDTH / 40;

  it('narrows the candidate edge list to a small fraction of the full scene', () => {
    const { worldToScreen, screenToWorld } = makeTransforms(pxPerMeter, sceneCenter, WIDTH, HEIGHT);
    const visibleLineBuffer = computeVisibleLineBuffer(fullLineBuffer, worldToScreen, screenToWorld, WIDTH, HEIGHT);

    expect(fullLineBuffer.length).toBeGreaterThan(1000);
    expect(visibleLineBuffer.length).toBeGreaterThan(0);
    expect(visibleLineBuffer.length).toBeLessThan(fullLineBuffer.length * 0.1);
  });

  it('every surviving edge actually overlaps the viewport bounds', () => {
    const { worldToScreen, screenToWorld } = makeTransforms(pxPerMeter, sceneCenter, WIDTH, HEIGHT);
    const vp = viewportWorldBounds({ width: WIDTH, height: HEIGHT, screenToWorld }, 0);
    const visibleLineBuffer = computeVisibleLineBuffer(fullLineBuffer, worldToScreen, screenToWorld, WIDTH, HEIGHT);

    for (const edge of visibleLineBuffer) {
      const eMinX = Math.min(edge.p1.x, edge.p2.x);
      const eMaxX = Math.max(edge.p1.x, edge.p2.x);
      const eMinY = Math.min(edge.p1.y, edge.p2.y);
      const eMaxY = Math.max(edge.p1.y, edge.p2.y);
      expect(eMaxX).toBeGreaterThanOrEqual(vp.minX);
      expect(eMinX).toBeLessThanOrEqual(vp.maxX);
      expect(eMaxY).toBeGreaterThanOrEqual(vp.minY);
      expect(eMinY).toBeLessThanOrEqual(vp.maxY);
    }
  });

  it('an off-screen edge (outside the viewport) is excluded and cannot be snapped to', () => {
    // Pick an edge far from the scene center — guaranteed outside a 40m x 27m window centered on it,
    // as long as the scene is meaningfully larger than the window (asserted above: >1000 edges, sceneWidth >> 40m).
    expect(sceneWidth).toBeGreaterThan(200);
    expect(sceneHeight).toBeGreaterThan(200);
    const farEdge = fullLineBuffer.find((e) => Math.hypot(e.p1.x - sceneCenter.x, e.p1.y - sceneCenter.y) > 100);
    expect(farEdge).toBeDefined();

    const { worldToScreen, screenToWorld } = makeTransforms(pxPerMeter, sceneCenter, WIDTH, HEIGHT);
    const visibleLineBuffer = computeVisibleLineBuffer(fullLineBuffer, worldToScreen, screenToWorld, WIDTH, HEIGHT);

    expect(visibleLineBuffer.find((e) => e.id === farEdge!.id)).toBeUndefined();
  });

  it('SnapCoordinator still resolves snaps near the cursor when fed only the culled buffer', () => {
    const { worldToScreen, screenToWorld } = makeTransforms(pxPerMeter, sceneCenter, WIDTH, HEIGHT);
    const visibleLineBuffer = computeVisibleLineBuffer(fullLineBuffer, worldToScreen, screenToWorld, WIDTH, HEIGHT);
    expect(visibleLineBuffer.length).toBeGreaterThan(0);

    // Snap toward an actual vertex that survived culling, to prove candidates are still reachable post-cull.
    const targetVertex = visibleLineBuffer[0].p1;
    const cursor: Point2D = { x: targetVertex.x + 0.02, y: targetVertex.y + 0.01 };

    const coordinator = new SnapCoordinator();
    const context: SnapContext = {
      mouseWorld: cursor,
      mouseScreen: worldToScreen(cursor.x, cursor.y),
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: visibleLineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      thresholdPx: 12,
    };

    const result = coordinator.evaluate(cursor, context);
    expect(result.snapped).toBe(true);
  });
});
