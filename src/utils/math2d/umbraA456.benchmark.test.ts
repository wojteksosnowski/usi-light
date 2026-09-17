import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  extractBuildingStoryTiers,
  MasterplanStoryTier,
  getMasterplanSolarAngles,
  computeStoryShadowPolygonWithHoles,
  SolarAngles,
} from '../../components/cad/masterplan/masterplanGeometry';
import {
  clusterTiersByShadowOverlap,
  unionPolygonsWithHolesHierarchical,
  polygonsWithHolesBounds,
  tierShadowReachBounds,
  boundsOverlap,
} from '../../components/cad/masterplan/masterplanSpatial';
import {
  calculateSignedArea,
  computePointsBoundingBox,
  PolygonWithHoles,
  isPointInPolygon,
  isPolygonCCW,
} from './polygons';
import {
  findSegmentIntersection,
  fastUnionTwoSimpleLoops,
} from './polygonBooleanTwo';
import { Point2D, BuildingLoop } from '../../types/geometry';

describe('UMBRA A456 - Armored Performance Benchmark & Bottleneck Drill-Down', () => {
  const warszawaPath = path.resolve(__dirname, '../../../reference/warszawa.json');

  let buildings: BuildingLoop[] = [];
  let allTiers: MasterplanStoryTier[] = [];

  if (fs.existsSync(warszawaPath)) {
    const rawScene = JSON.parse(fs.readFileSync(warszawaPath, 'utf-8'));
    buildings = (rawScene.buildings || []).filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );
    for (const bldg of buildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
  }

  it('profiles full step-by-step pipeline for UMBRA A456 on warszawa.json', () => {
    const latitude = 52.23;
    const longitude = 21.01;
    const equinox = 'spring';
    const hour = 12.0;
    const runs = 10;

    // Warm-up
    getMasterplanSolarAngles(latitude, longitude, equinox, hour, 0, 'raycasting');

    let tTiersSum = 0;
    let tSolarSum = 0;
    let tClusterSum = 0;
    let tProjectSum = 0;
    let tUnionSum = 0;
    let tTotalSum = 0;

    let tierCount = 0;
    let clusterCount = 0;
    let shadowPolyCount = 0;
    let finalPolyCount = 0;

    for (let r = 0; r < runs; r++) {
      const tStart = performance.now();

      // Step 1: Tier extraction
      const t0 = performance.now();
      const currentTiers: MasterplanStoryTier[] = [];
      for (const bldg of buildings) {
        currentTiers.push(...extractBuildingStoryTiers(bldg));
      }
      const tTiers = performance.now() - t0;
      tTiersSum += tTiers;
      tierCount = currentTiers.length;

      // Step 2: Solar angles & precalculated LUT vector
      const t1 = performance.now();
      const solarAngles = getMasterplanSolarAngles(latitude, longitude, equinox, hour, 0, 'raycasting');
      const tSolar = performance.now() - t1;
      tSolarSum += tSolar;

      // Step 3: AABB Spatial Clustering
      const t2 = performance.now();
      const validTiers = currentTiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0);
      const clusters = clusterTiersByShadowOverlap(validTiers, solarAngles);
      const tCluster = performance.now() - t2;
      tClusterSum += tCluster;
      clusterCount = clusters.length;

      // Step 4: Story shadow projection
      const t3 = performance.now();
      const clusterPolys: PolygonWithHoles[][] = [];
      let totalProjected = 0;
      for (const cluster of clusters) {
        const cList: PolygonWithHoles[] = [];
        for (const tier of cluster) {
          const polys = computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, solarAngles, tier.hTop, tier.hBottom);
          cList.push(...polys);
        }
        totalProjected += cList.length;
        clusterPolys.push(cList);
      }
      const tProject = performance.now() - t3;
      tProjectSum += tProject;
      shadowPolyCount = totalProjected;

      // Step 5: Hierarchical Pairwise Union
      const t4 = performance.now();
      const finalPolys: PolygonWithHoles[] = [];
      for (const cList of clusterPolys) {
        if (cList.length === 1) {
          finalPolys.push(cList[0]);
        } else if (cList.length > 1) {
          finalPolys.push(...unionPolygonsWithHolesHierarchical(cList));
        }
      }
      const tUnion = performance.now() - t4;
      tUnionSum += tUnion;
      finalPolyCount = finalPolys.length;

      const tTotal = performance.now() - tStart;
      tTotalSum += tTotal;
    }

    const avgTiers = tTiersSum / runs;
    const avgSolar = tSolarSum / runs;
    const avgCluster = tClusterSum / runs;
    const avgProject = tProjectSum / runs;
    const avgUnion = tUnionSum / runs;
    const avgTotal = tTotalSum / runs;

    console.log(`\n================================================================================`);
    console.log(`[UMBRA A456 PIPELINE STEP-BY-STEP PROFILING (warszawa.json: ${buildings.length} buildings, ${tierCount} tiers)]`);
    console.log(`================================================================================`);
    console.log(` 1. Tier Extraction & Story Collapsing:  ${avgTiers.toFixed(3).padStart(7)} ms (${((avgTiers / avgTotal) * 100).toFixed(1).padStart(5)}%) | ${tierCount} tiers`);
    console.log(` 2. Solar Vector & LUT Calculation:      ${avgSolar.toFixed(3).padStart(7)} ms (${((avgSolar / avgTotal) * 100).toFixed(1).padStart(5)}%) | Azimuth ${solarAngles(latitude, longitude, equinox, hour).azimuthDeg.toFixed(1)}°`);
    console.log(` 3. AABB Overlap Spatial Clustering:     ${avgCluster.toFixed(3).padStart(7)} ms (${((avgCluster / avgTotal) * 100).toFixed(1).padStart(5)}%) | ${clusterCount} spatial clusters`);
    console.log(` 4. Story Shadow Projection (Raycast):   ${avgProject.toFixed(3).padStart(7)} ms (${((avgProject / avgTotal) * 100).toFixed(1).padStart(5)}%) | ${shadowPolyCount} raw projected polys`);
    console.log(` 5. Hierarchical Boolean Union:          ${avgUnion.toFixed(3).padStart(7)} ms (${((avgUnion / avgTotal) * 100).toFixed(1).padStart(5)}%) | ${finalPolyCount} final umbra polys`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(` TOTAL TIME PER FRAME:                   ${avgTotal.toFixed(3).padStart(7)} ms (100.0%) | ${(1000 / avgTotal).toFixed(1)} FPS`);
    console.log(`================================================================================\n`);

    expect(avgTotal).toBeLessThan(1500);
  }, 30000);

  it('drills down 1 level deeper into the largest bottleneck (Hierarchical Boolean Union)', () => {
    const solarAngles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0, 'raycasting');
    const validTiers = allTiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0);
    const clusters = clusterTiersByShadowOverlap(validTiers, solarAngles);

    // Wyciągnij reprezentatywne pary nakładających się poligonów z realnych klastrów
    const polyPairs: [Point2D[], Point2D[]][] = [];
    for (const cluster of clusters) {
      if (cluster.length > 1) {
        const cPolys: Point2D[][] = [];
        for (const tier of cluster) {
          const res = computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, solarAngles, tier.hTop, tier.hBottom);
          for (const r of res) {
            cPolys.push(r.outer);
          }
        }
        for (let i = 0; i < cPolys.length - 1; i++) {
          const b1 = computePointsBoundingBox(cPolys[i]);
          const b2 = computePointsBoundingBox(cPolys[i + 1]);
          if (boundsOverlap(b1, b2)) {
            polyPairs.push([cPolys[i], cPolys[i + 1]]);
            if (polyPairs.length >= 40) break;
          }
        }
      }
      if (polyPairs.length >= 40) break;
    }

    expect(polyPairs.length).toBeGreaterThan(0);

    const N = 100;
    let tAABBSum = 0;
    let tIntersectSum = 0;
    let tSplitSortSum = 0;
    let tPointClassifySum = 0;
    let tCycleTraversalSum = 0;
    let tCleanCollinearSum = 0;

    for (let r = 0; r < N; r++) {
      for (const [polyA, polyB] of polyPairs) {
        // Subprocess 1: AABB Screening
        const t0 = performance.now();
        const boxA = computePointsBoundingBox(polyA);
        const boxB = computePointsBoundingBox(polyB);
        const disjoint =
          boxA.maxX < boxB.minX - 1e-6 ||
          boxA.minX > boxB.maxX + 1e-6 ||
          boxA.maxY < boxB.minY - 1e-6 ||
          boxA.minY > boxB.maxY + 1e-6;
        tAABBSum += performance.now() - t0;

        if (disjoint) continue;

        // Subprocess 2: Linear Equation Ax + By + C = 0 Segment-Segment Intersections
        const t1 = performance.now();
        const nA = polyA.length;
        const nB = polyB.length;
        const splitsA: number[][] = Array.from({ length: nA }, () => [0, 1]);
        const splitsB: number[][] = Array.from({ length: nB }, () => [0, 1]);
        let interCount = 0;

        for (let i = 0; i < nA; i++) {
          const p1 = polyA[i];
          const p2 = polyA[(i + 1) % nA];
          for (let j = 0; j < nB; j++) {
            const q1 = polyB[j];
            const q2 = polyB[(j + 1) % nB];
            const hit = findSegmentIntersection(p1, p2, q1, q2);
            if (hit) {
              splitsA[i].push(hit.t);
              splitsB[j].push(hit.u);
              interCount++;
            }
          }
        }
        tIntersectSum += performance.now() - t1;

        // Subprocess 3: Edge Splitting & Parameter Sorting
        const t2 = performance.now();
        for (let i = 0; i < nA; i++) {
          splitsA[i].sort((a, b) => a - b);
        }
        for (let j = 0; j < nB; j++) {
          splitsB[j].sort((a, b) => a - b);
        }
        tSplitSortSum += performance.now() - t2;

        // Subprocess 4: Point Inclusion & Classification
        const t3 = performance.now();
        let insideCountA = 0;
        for (let i = 0; i < nA; i++) {
          if (isPointInPolygon(polyA[i], polyB)) {
            insideCountA++;
          }
        }
        tPointClassifySum += performance.now() - t3;

        // Subprocess 5: Full 2-Polygon Union Execution
        const t4 = performance.now();
        const unionRes = fastUnionTwoSimpleLoops(polyA, polyB);
        tCycleTraversalSum += performance.now() - t4;

        // Subprocess 6: Collinear cleanup
        if (unionRes) {
          const t5 = performance.now();
          const loop = unionRes.outer;
          let simplified = 0;
          for (let k = 0; k < loop.length; k++) {
            const pPrev = loop[(k - 1 + loop.length) % loop.length];
            const pCurr = loop[k];
            const pNext = loop[(k + 1) % loop.length];
            const cross = (pCurr.x - pPrev.x) * (pNext.y - pCurr.y) - (pCurr.y - pPrev.y) * (pNext.x - pCurr.x);
            if (Math.abs(cross) < 1e-8) simplified++;
          }
          tCleanCollinearSum += performance.now() - t5;
        }
      }
    }

    const totalSubTime =
      tAABBSum + tIntersectSum + tSplitSortSum + tPointClassifySum + tCycleTraversalSum + tCleanCollinearSum;

    console.log(`\n================================================================================`);
    console.log(`[DEEP DIVE DRILL-DOWN: 2-POLYGON BOOLEAN UNION SUBPROCESSES (${polyPairs.length} pairs x ${N} runs = ${polyPairs.length * N} ops)]`);
    console.log(`================================================================================`);
    console.log(` A. Bounding Box & AABB Rejection:       ${tAABBSum.toFixed(2).padStart(7)} ms (${((tAABBSum / totalSubTime) * 100).toFixed(1).padStart(5)}%) | O(1) Quick-Reject`);
    console.log(` B. Line Equation (Ax+By+C=0) Intersect: ${tIntersectSum.toFixed(2).padStart(7)} ms (${((tIntersectSum / totalSubTime) * 100).toFixed(1).padStart(5)}%) | Cramer 2x2 Determinants`);
    console.log(` C. Edge Splitting & Param Sorting:      ${tSplitSortSum.toFixed(2).padStart(7)} ms (${((tSplitSortSum / totalSubTime) * 100).toFixed(1).padStart(5)}%) | Parameter t, u sort`);
    console.log(` D. Point Inclusion & Classification:    ${tPointClassifySum.toFixed(2).padStart(7)} ms (${((tPointClassifySum / totalSubTime) * 100).toFixed(1).padStart(5)}%) | Winding / Raycast`);
    console.log(` E. Cycle Traversal & Loop Assembly:     ${tCycleTraversalSum.toFixed(2).padStart(7)} ms (${((tCycleTraversalSum / totalSubTime) * 100).toFixed(1).padStart(5)}%) | Graph Weaving`);
    console.log(` F. Collinear Vertex Simplification:     ${tCleanCollinearSum.toFixed(2).padStart(7)} ms (${((tCleanCollinearSum / totalSubTime) * 100).toFixed(1).padStart(5)}%) | Micro-edge Reduction`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(` TOTAL UNION SUBPROCESS TIME:            ${totalSubTime.toFixed(2).padStart(7)} ms (100.0%) | ${(polyPairs.length * N / (totalSubTime / 1000)).toFixed(0)} pair-unions/sec`);
    console.log(`================================================================================\n`);

    expect(totalSubTime).toBeGreaterThan(0);
  }, 40000);
});

function solarAngles(lat: number, lon: number, eq: 'spring' | 'autumn', hr: number) {
  return getMasterplanSolarAngles(lat, lon, eq, hr, 0, 'raycasting');
}
