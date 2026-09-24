import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BuildingLoop, Point2D } from '../../types/geometry';
import {
  computeHourlyShadowsLive,
  computeFullShadowAnalysis,
  prepareShadowBuilding,
  computeBuildingShadowReachAABB,
  doAABBsOverlap,
  computeProjectShadowReachAABB,
} from './shadowEnvelope';
import { isPolygonConvex } from './polygons';
import { getGlobalSolarLUT } from '../solar';

function loadScene(relativePath: string): { buildings: BuildingLoop[]; raw: any } {
  const fullPath = path.resolve(__dirname, '../../../', relativePath);
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  return { buildings: (raw.buildings || []) as BuildingLoop[], raw };
}

describe('Scene Speed Comparison — kra.json vs poz.json vs wro.json', () => {
  const scenes = [
    { name: 'POZ (Poznań)', path: 'reference/speed/poz.json' },
    { name: 'KRA (Kraków)', path: 'reference/speed/kra.json' },
    { name: 'WRO (Wrocław)', path: 'reference/speed/wro.json' },
  ];

  it('profiles and contrasts geometric complexity & shadow pipeline across all 3 scenes', () => {
    console.log('\n================================================================================');
    console.log('[SCENE COMPLEXITY & BENCHMARK COMPARISON: POZ vs KRA vs WRO]');
    console.log('================================================================================');

    for (const sc of scenes) {
      const { buildings, raw } = loadScene(sc.path);
      const realBldgs = buildings.filter((b) => b.category !== 'boundary');
      const boundaries = buildings.filter((b) => b.category === 'boundary');

      // Setup real tested buildings with height > 0
      const tallRealBuildings = realBldgs.filter((b) => (b.defaultHeight || 0) > 0 && b.vertices && b.vertices.length >= 3);
      
      const testCounts = [1, 5, Math.min(10, tallRealBuildings.length)];

      // Geometry stats
      let totalVerts = 0;
      let convexCount = 0;
      let concaveCount = 0;
      let complexVertCount = 0; // > 20 vertices
      for (const b of realBldgs) {
        const vLen = b.vertices?.length || 0;
        totalVerts += vLen;
        if (vLen >= 3) {
          if (isPolygonConvex(b.vertices)) convexCount++;
          else concaveCount++;
          if (vLen > 20) complexVertCount++;
        }
      }

      const avgVerts = (totalVerts / (realBldgs.length || 1)).toFixed(1);
      const convexRatio = ((convexCount / (convexCount + concaveCount || 1)) * 100).toFixed(1);

      console.log(`\n--- Scene: ${sc.name} ---`);
      console.log(`  Total objects: ${buildings.length} (Real buildings: ${realBldgs.length}, Boundaries: ${boundaries.length}, Tall buildings: ${tallRealBuildings.length})`);
      console.log(`  Vertices: total ${totalVerts}, avg/bldg: ${avgVerts}, complex (>20 verts): ${complexVertCount}`);
      console.log(`  Convex ratio: ${convexRatio}% (${convexCount} convex / ${concaveCount} concave)`);

      for (const count of testCounts) {
        if (count <= 0) continue;
        const testSubsetIds = new Set(tallRealBuildings.slice(0, count).map((b) => b.id));
        const sceneWithTested = buildings.map((b) => ({
          ...b,
          isTested: testSubsetIds.has(b.id),
        }));

        // Measure Live Shadow Range (0.5h step)
        const t0Live = performance.now();
        const liveRes = computeHourlyShadowsLive(sceneWithTested, raw.settings?.latitude ?? 52.23, raw.settings?.longitude ?? 21.01, raw.settings?.equinoxDate ?? 'spring', 0.5, 'raycasting');
        const liveTime = performance.now() - t0Live;

        // Measure Final Shadow Range (0.25h step)
        const t0Final = performance.now();
        const finalRes = computeFullShadowAnalysis(sceneWithTested, raw.settings?.latitude ?? 52.23, raw.settings?.longitude ?? 21.01, raw.settings?.equinoxDate ?? 'spring', 0.25, 'raycasting');
        const finalTime = performance.now() - t0Final;

        console.log(`  [Tested Buildings: ${count}]`);
        console.log(`    ⏱️ Live Shadow Range (0.5h, 21 steps):  ${liveTime.toFixed(2)} ms (${(1000 / liveTime).toFixed(1)} FPS) | ${liveRes.envelopeLoops.length} envelope loops`);
        console.log(`    ⏱️ Final Shadow Range (0.25h, 41 steps): ${finalTime.toFixed(2)} ms (${(1000 / finalTime).toFixed(1)} FPS) | ${finalRes.envelopeLoops.length} envelope loops`);
      }
    }
    console.log('\n================================================================================\n');
  }, 180000);
});
