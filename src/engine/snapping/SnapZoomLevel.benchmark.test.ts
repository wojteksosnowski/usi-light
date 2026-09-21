import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SnapCoordinator } from './SnapCoordinator';
import { SnapContext } from './types';
import { SpatialLineIndex } from './SpatialLineIndex';
import { buildLineBufferFromBuildings, flattenLineBuffer, CachedLineEquation } from '../../utils/lineBufferEngine';
import { viewportWorldBounds, edgeIntersectsScreenRect } from '../../components/cad/masterplan/masterplanSpatial';
import { BuildingLoop, Point2D } from '../../types/geometry';

const warszawaPath = path.resolve(__dirname, '../../../reference/warszawa.json');

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

/** Mirrors useCanvasInteraction.ts:476-486 (visibleLineBuffer derivation). */
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

function seededCursors(count: number, centerWorld: Point2D, spanMeters: number): Point2D[] {
  // Deterministic pseudo-random offsets (no Math.random) so benchmark runs are reproducible.
  const pts: Point2D[] = [];
  let seed = 1234567;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    pts.push({
      x: centerWorld.x + (next() - 0.5) * spanMeters,
      y: centerWorld.y + (next() - 0.5) * spanMeters,
    });
  }
  return pts;
}

describe('SNAP performance across zoom levels (reference/warszawa.json)', () => {
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

  const WIDTH = 1200;
  const HEIGHT = 800;
  const CURSOR_SAMPLES = 20;
  const FILTER_RUNS = 30;

  // pxPerMeter chosen so WIDTH/pxPerMeter gives a realistic on-screen window width per level,
  // spanning the whole warszawa.json scene (~1296m) down to close-up single-building detail (~4m).
  const zoomLevels = [
    { label: 'whole-scene', pxPerMeter: WIDTH / 1400 },
    { label: 'district', pxPerMeter: WIDTH / 200 },
    { label: 'single-building', pxPerMeter: WIDTH / 16 },
    { label: 'detail', pxPerMeter: WIDTH / 4 },
  ];

  it('keeps SnapCoordinator.evaluate() fast at every zoom level via viewport-culled candidates', () => {
    for (const { label, pxPerMeter } of zoomLevels) {
      const { worldToScreen, screenToWorld } = makeTransforms(pxPerMeter, sceneCenter, WIDTH, HEIGHT);

      const tFilter0 = performance.now();
      let visibleLineBuffer: CachedLineEquation[] = [];
      for (let i = 0; i < FILTER_RUNS; i++) {
        visibleLineBuffer = computeVisibleLineBuffer(fullLineBuffer, worldToScreen, screenToWorld, WIDTH, HEIGHT);
      }
      const avgFilterMs = (performance.now() - tFilter0) / FILTER_RUNS;

      const windowWorldWidth = WIDTH / pxPerMeter;
      const cursors = seededCursors(CURSOR_SAMPLES, sceneCenter, windowWorldWidth * 0.8);

      const coordinator = new SnapCoordinator();
      // Warm-up: builds the rbush index once (rebuildIfStale keys off buffer reference, matching real usage).
      coordinator.evaluate(cursors[0], {
        mouseWorld: cursors[0],
        mouseScreen: worldToScreen(cursors[0].x, cursors[0].y),
        worldToScreen,
        screenToWorld,
        buildings: [],
        lineBuffer: visibleLineBuffer,
        isOsnapActive: true,
        isDirectionSnappingActive: false,
        thresholdPx: 12,
      });

      const tEval0 = performance.now();
      for (const cursor of cursors) {
        coordinator.clearStickySnap();
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
        coordinator.evaluate(cursor, context);
      }
      const avgEvalMs = (performance.now() - tEval0) / CURSOR_SAMPLES;

      console.log(`\n[BENCHMARK: SNAP @ ${label} (${pxPerMeter.toFixed(2)} px/m, ~${windowWorldWidth.toFixed(0)}m window)]`);
      console.log(`  - Full scene edges: ${fullLineBuffer.length}`);
      console.log(`  - Visible (culled) edges: ${visibleLineBuffer.length}`);
      console.log(`  - Avg visibleLineBuffer filter time: ${avgFilterMs.toFixed(3)} ms`);
      console.log(`  - Avg SnapCoordinator.evaluate() time: ${avgEvalMs.toFixed(3)} ms`);

      expect(avgEvalMs).toBeLessThan(5);
    }
  }, 30000);

  it('culling shrinks the rbush index-rebuild cost, which is paid on every pan/zoom frame', () => {
    // rbush.load() is O(n log n) in the indexed set's size, and SpatialLineIndex.rebuildIfStale
    // (SpatialLineIndex.ts:22-40) reruns it every time the lineBuffer *reference* changes — i.e.
    // every pan/zoom-driven useMemo recompute in production (useCanvasInteraction.ts:468-487), not
    // per pointermove. Query cost itself (rbush.search on a tiny cursor-aperture bbox) is cheap and
    // near-constant regardless of index size, so the rebuild is where viewport culling actually pays
    // off — this benchmark measures that cost directly instead of the already-fast per-query cost.
    const district = zoomLevels.find((z) => z.label === 'district')!;
    const { worldToScreen, screenToWorld } = makeTransforms(district.pxPerMeter, sceneCenter, WIDTH, HEIGHT);
    const visibleLineBuffer = computeVisibleLineBuffer(fullLineBuffer, worldToScreen, screenToWorld, WIDTH, HEIGHT);
    expect(visibleLineBuffer.length).toBeLessThan(fullLineBuffer.length);

    const REBUILD_RUNS = 50;
    const timeRebuilds = (lineBuffer: CachedLineEquation[]): number => {
      const index = new SpatialLineIndex();
      const t0 = performance.now();
      for (let i = 0; i < REBUILD_RUNS; i++) {
        // A fresh array reference each iteration forces rebuildIfStale to actually rebuild,
        // simulating a new visibleLineBuffer produced by each pan/zoom frame.
        index.rebuildIfStale([...lineBuffer]);
      }
      return (performance.now() - t0) / REBUILD_RUNS;
    };

    const avgCulledMs = timeRebuilds(visibleLineBuffer);
    const avgUnculledMs = timeRebuilds(fullLineBuffer);

    console.log(`\n[BENCHMARK: SNAP rbush rebuild, culled vs unculled @ district zoom]`);
    console.log(`  - Culled edges: ${visibleLineBuffer.length} -> avg rebuild: ${avgCulledMs.toFixed(3)} ms`);
    console.log(`  - Unculled edges: ${fullLineBuffer.length} -> avg rebuild: ${avgUnculledMs.toFixed(3)} ms`);

    expect(avgCulledMs).toBeLessThanOrEqual(avgUnculledMs * 0.7);
  }, 30000);
});
