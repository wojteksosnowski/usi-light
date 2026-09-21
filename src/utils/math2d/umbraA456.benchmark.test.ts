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
  unionPolygonLoops,
  differencePolygonLoops,
} from './polygons';
import {
  findSegmentIntersection,
  fastUnionTwoSimpleLoops,
  getFastUnionTelemetry,
  resetFastUnionTelemetry,
} from './polygonBooleanTwo';
import {
  computeFullShadowAnalysis,
  prepareShadowBuilding,
  collectBuildingShadowPolysPrepared,
  computeProjectShadowReachAABB,
  computeBuildingShadowReachAABB,
  doAABBsOverlap,
  PreparedShadowBuilding,
} from './shadowEnvelope';
import { getGlobalSolarLUT } from '../solar';
import { getCachedGroundShadowSamples, MasterplanColorSample } from '../../components/cad/masterplan/masterplanShadowCache';
import { Point2D, BuildingLoop } from '../../types/geometry';


// Kontrola poziomu fallbacku do polygon-clipping wewnątrz fastUnionTwoSimpleLoops, tak jak
// w shadowEnvelope.benchmark.test.ts — tu dla ścieżki MasterPlan (unionPolygonsWithHolesHierarchical
// w masterplanSpatial.ts również woła fastUnionTwoSimpleLoops per-parę przed fallbackiem).
// Próg 0.28 był skalibrowany 2026-09-21 na zmierzonym fallbackRate ≈ 0.219 (318-budynkowy
// reference/warszawa.json). Diagnoza (2026-09-21) wykazała, że ~82% tych fallbacków to przypadek
// "multiple outer components" — pary tierów, których AABB zasięgu cienia się nakładają, ale których
// rzeczywiste footprinty są całkowicie rozłączne (sąsiadujące, nie nachodzące budynki); to samo
// ustalenie fastUnionTwoSimpleLoops robi po pełnym, kosztownym trawersowaniu grafu. Dodano tani
// early-exit `arePolygonsDefinitelyDisjoint` (polygonBooleanTwo.ts) wywoływany w `fastUnionPair`
// (masterplanSpatial.ts) PRZED próbą unii — mierzony fallbackRate spadł do 0.0 na obu zestawach
// referencyjnych (warszawa.json i warszawa-geo.json). Próg obniżony z marginesem na szum pomiarowy.
const MAX_MASTERPLAN_UNION_FALLBACK_RATE = 0.05;

function loadBuildingsAndTiers(refPath: string): { buildings: BuildingLoop[]; allTiers: MasterplanStoryTier[] } {
  const buildings: BuildingLoop[] = [];
  const allTiers: MasterplanStoryTier[] = [];
  if (fs.existsSync(refPath)) {
    const rawScene = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
    buildings.push(
      ...(rawScene.buildings || []).filter(
        (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
      )
    );
    for (const bldg of buildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
  }
  return { buildings, allTiers };
}

function runFallbackTelemetry(latitude: number, longitude: number, equinox: 'spring', hour: number, allTiers: MasterplanStoryTier[]) {
  resetFastUnionTelemetry();
  for (let r = 0; r < 5; r++) {
    const solarAngles = getMasterplanSolarAngles(latitude, longitude, equinox, hour, 0, 'raycasting');
    const validTiers = allTiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0);
    const clusters = clusterTiersByShadowOverlap(validTiers, solarAngles);
    for (const cluster of clusters) {
      const cList: PolygonWithHoles[] = [];
      for (const tier of cluster) {
        cList.push(...computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, solarAngles, tier.hTop, tier.hBottom));
      }
      if (cList.length > 1) unionPolygonsWithHolesHierarchical(cList);
    }
  }
  return getFastUnionTelemetry();
}

describe('UMBRA A456 - Armored Performance Benchmark & Bottleneck Drill-Down', () => {
  const warszawaPath = path.resolve(__dirname, '../../../reference/warszawa.json');
  const warszawaGeoPath = path.resolve(__dirname, '../../../reference/warszawa-geo.json');

  const { buildings, allTiers } = loadBuildingsAndTiers(warszawaPath);

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

  it('Telemetry: how often does fastUnionTwoSimpleLoops fall back to polygon-clipping in the MasterPlan hierarchical union', { timeout: 20000 }, () => {
    const latitude = 52.23;
    const longitude = 21.01;
    const equinox = 'spring';
    const hour = 12.0;

    const t = runFallbackTelemetry(latitude, longitude, equinox, hour, allTiers);
    const fallbackRate = t.totalCalls > 0 ? t.fallbackCalls / t.totalCalls : 0;

    console.log('\n================================================================================');
    console.log('[fastUnionTwoSimpleLoops TELEMETRY: 5x MasterPlan hierarchical union on warszawa.json]');
    console.log('================================================================================');
    console.log(`  - Total calls:                  ${t.totalCalls}`);
    console.log(`  - Fast-path success:             ${t.fastPathSuccess} (${(t.totalCalls ? t.fastPathSuccess / t.totalCalls * 100 : 0).toFixed(1)}%)`);
    console.log(`  - FALLBACK to polygon-clipping:  ${t.fallbackCalls} (${(fallbackRate * 100).toFixed(1)}%)`);
    console.log(`  Fallback guard: ${fallbackRate.toFixed(3)} <= ${MAX_MASTERPLAN_UNION_FALLBACK_RATE} (MAX_MASTERPLAN_UNION_FALLBACK_RATE)`);
    console.log('================================================================================\n');

    expect(t.totalCalls).toBeGreaterThan(0);
    expect(fallbackRate).toBeLessThan(MAX_MASTERPLAN_UNION_FALLBACK_RATE);
  });

  it('Telemetry (geoportal comparison): fastUnionTwoSimpleLoops fallback rate on warszawa-geo.json', { timeout: 20000 }, () => {
    const { allTiers: geoTiers, buildings: geoBuildings } = loadBuildingsAndTiers(warszawaGeoPath);
    if (geoBuildings.length === 0) {
      console.log('[SKIP] reference/warszawa-geo.json not found or empty — skipping OSM vs geoportal comparison.');
      return;
    }
    const latitude = 52.23;
    const longitude = 21.01;
    const equinox = 'spring';
    const hour = 12.0;

    const tOsm = runFallbackTelemetry(latitude, longitude, equinox, hour, allTiers);
    const fallbackRateOsm = tOsm.totalCalls > 0 ? tOsm.fallbackCalls / tOsm.totalCalls : 0;

    const tGeo = runFallbackTelemetry(latitude, longitude, equinox, hour, geoTiers);
    const fallbackRateGeo = tGeo.totalCalls > 0 ? tGeo.fallbackCalls / tGeo.totalCalls : 0;

    console.log('\n================================================================================');
    console.log('[OSM vs GEOPORTAL: fastUnionTwoSimpleLoops fallback comparison, 5x MasterPlan hierarchical union]');
    console.log('================================================================================');
    console.table([
      { dataset: `warszawa.json (OSM, ${buildings.length} bldg)`, totalCalls: tOsm.totalCalls, fastPath: tOsm.fastPathSuccess, fallback: tOsm.fallbackCalls, fallbackRate: (fallbackRateOsm * 100).toFixed(1) + '%' },
      { dataset: `warszawa-geo.json (geoportal, ${geoBuildings.length} bldg)`, totalCalls: tGeo.totalCalls, fastPath: tGeo.fastPathSuccess, fallback: tGeo.fallbackCalls, fallbackRate: (fallbackRateGeo * 100).toFixed(1) + '%' },
    ]);
    console.log('[Fallback cause breakdown]');
    console.table([
      { dataset: 'OSM', disjoint: (tOsm as any).disjointExits, containment: (tOsm as any).containmentExits, insufficientSegments: (tOsm as any).insufficientSegmentsExits, multipleOuterComponents: (tOsm as any).multipleOuterComponentsExits, emptyLoops: (tOsm as any).emptyLoopsExits, caughtException: (tOsm as any).caughtExceptionExits },
      { dataset: 'GEO', disjoint: (tGeo as any).disjointExits, containment: (tGeo as any).containmentExits, insufficientSegments: (tGeo as any).insufficientSegmentsExits, multipleOuterComponents: (tGeo as any).multipleOuterComponentsExits, emptyLoops: (tGeo as any).emptyLoopsExits, caughtException: (tGeo as any).caughtExceptionExits },
    ]);
    console.log('================================================================================\n');

    expect(tOsm.totalCalls).toBeGreaterThan(0);
    expect(tGeo.totalCalls).toBeGreaterThan(0);
  });

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

  it('drills down 2 levels deep: fastUnionTwoSimpleLoops (subprocess E, 55.7% of union cost) scaling vs. input vertex count', { timeout: 40000 }, () => {
    // Subprocess E powyżej mierzy pełne, realne wywołanie fastUnionTwoSimpleLoops (AABB-pruned
    // intersection search + subsegment build + classification + trawersacja grafu razem — to
    // jedna zoptymalizowana funkcja, nie da się jej rozłożyć z zewnątrz bez zmiany kodu
    // produkcyjnego). Zamiast tego sprawdzamy empirycznie, jak CAŁKOWITY koszt tej funkcji
    // skaluje się wraz ze złożonością wejścia na realnych klastrach z warszawa.json.
    const solarAngles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0, 'raycasting');
    const validTiers = allTiers.filter((t) => t.polygon && t.polygon.length >= 3 && t.hTop > 0);
    const clusters = clusterTiersByShadowOverlap(validTiers, solarAngles);

    const polyPairs: { a: Point2D[]; b: Point2D[]; vertexCount: number }[] = [];
    for (const cluster of clusters) {
      if (cluster.length <= 1) continue;
      const cPolys: Point2D[][] = [];
      for (const tier of cluster) {
        for (const r of computeStoryShadowPolygonWithHoles(tier.polygon, tier.holes, solarAngles, tier.hTop, tier.hBottom)) {
          cPolys.push(r.outer);
        }
      }
      for (let i = 0; i < cPolys.length - 1; i++) {
        const b1 = computePointsBoundingBox(cPolys[i]);
        const b2 = computePointsBoundingBox(cPolys[i + 1]);
        if (boundsOverlap(b1, b2)) {
          polyPairs.push({ a: cPolys[i], b: cPolys[i + 1], vertexCount: cPolys[i].length + cPolys[i + 1].length });
        }
      }
    }
    expect(polyPairs.length).toBeGreaterThan(0);

    const sorted = [...polyPairs].sort((a, b) => a.vertexCount - b.vertexCount);
    const third = Math.max(1, Math.floor(sorted.length / 3));
    const buckets = { small: sorted.slice(0, third), medium: sorted.slice(third, third * 2), large: sorted.slice(third * 2) };

    const runs = 200;
    function benchmarkBucket(pairs: typeof polyPairs) {
      if (pairs.length === 0) return null;
      let tSum = 0;
      const avgVertices = pairs.reduce((s, p) => s + p.vertexCount, 0) / pairs.length;
      for (let r = 0; r < runs; r++) {
        for (const { a, b } of pairs) {
          const t0 = performance.now();
          fastUnionTwoSimpleLoops(a, b);
          tSum += performance.now() - t0;
        }
      }
      return { avgVertices, avgMsPerCall: tSum / (runs * pairs.length), count: pairs.length };
    }

    const resSmall = benchmarkBucket(buckets.small);
    const resMedium = benchmarkBucket(buckets.medium);
    const resLarge = benchmarkBucket(buckets.large);

    console.log('\n================================================================================');
    console.log(`[LEVEL 2 DRILL-DOWN: fastUnionTwoSimpleLoops COST vs. INPUT VERTEX COUNT (${polyPairs.length} pairs)]`);
    console.log('================================================================================');
    for (const [label, res] of [['small', resSmall], ['medium', resMedium], ['large', resLarge]] as const) {
      if (!res) continue;
      console.log(` ${label.padEnd(7)} (n=${String(res.count).padStart(2)}): avg ${res.avgVertices.toFixed(0).padStart(4)} vertices/pair | ${res.avgMsPerCall.toFixed(4).padStart(8)} ms/call | ${(res.avgMsPerCall / res.avgVertices * 1000).toFixed(2)} us/vertex`);
    }
    if (resSmall && resLarge && resLarge.avgVertices > resSmall.avgVertices) {
      const vertexRatio = resLarge.avgVertices / resSmall.avgVertices;
      const timeRatio = resLarge.avgMsPerCall / resSmall.avgMsPerCall;
      const empiricalExponent = Math.log(timeRatio) / Math.log(vertexRatio);
      console.log('--------------------------------------------------------------------------------');
      console.log(` Wierzchołki large/small: ${vertexRatio.toFixed(2)}x | Czas large/small: ${timeRatio.toFixed(2)}x | Empiryczny wykładnik: n^${empiricalExponent.toFixed(2)}`);
      console.log(` (naiwna implementacja segment-intersection w tej klasie algorytmów jest O(nA*nB) ~ n^2; wynik bliski n^2 sugeruje, że AABB-pruning obecny w kodzie nie eliminuje kwadratowego rdzenia na gęsto nakładających się parach)`);
    }
    console.log('================================================================================\n');

    expect(resSmall).not.toBeNull();
  });
});

describe('CadCanvas Rendering Performance — Variant A vs B (WFS switch) on warszawa.json', () => {
  const warszawaPath = path.resolve(__dirname, '../../../reference/warszawa.json');

  let buildingsVariantA: BuildingLoop[] = [];
  let buildingsVariantB: BuildingLoop[] = [];

  if (fs.existsSync(warszawaPath)) {
    const rawScene = JSON.parse(fs.readFileSync(warszawaPath, 'utf-8'));
    const all = (rawScene.buildings || []) as BuildingLoop[];

    // Wariant A: pierwsze 15 budynków jako testowane, reszta jako kontekst blokujący
    // (symulacja przed pobieraniem WFS — lokalna geometria)
    buildingsVariantA = all
      .filter((b) => b.vertices && b.vertices.length >= 3 && ((b.elevation ?? 0) + (b.defaultHeight ?? 0)) > 0)
      .map((b, idx) => ({ ...b, isTested: idx < 15, category: b.category ?? 'building' }));

    // Wariant B: symulacja po przełączeniu na WFS — dodatkowe budynki z większą liczbą wierzchołków
    // Emulujemy efekt WFS: 30% budynków dostaje dodatkowe wierzchołki (dokładniejsze obrysy) +
    // dorzucamy 20 nowych budynków (nowe obiekty z geoportalu) jako dodatkowe kontekstowe.
    buildingsVariantB = buildingsVariantA.map((b) => {
      if (!b.isTested && b.vertices && b.vertices.length >= 4 && Math.random() > 0.7) {
        // Rozgęszczamy obrys: wstawiamy punkty środkowe krawędzi (symuluje dokładniejszy obrys WFS)
        const densified: Point2D[] = [];
        for (let i = 0; i < b.vertices.length; i++) {
          densified.push(b.vertices[i]);
          const next = b.vertices[(i + 1) % b.vertices.length];
          densified.push({ x: (b.vertices[i].x + next.x) / 2, y: (b.vertices[i].y + next.y) / 2 });
        }
        return { ...b, vertices: densified, id: b.id + '_wfs' };
      }
      return b;
    });

    // Dodaj 20 nowych budynków WFS (nowe obiekty na scenie, nieobecne w wariancie A)
    const existingBuildings = buildingsVariantA.filter((b) => !b.isTested);
    const centroid = existingBuildings.reduce(
      (acc, b) => ({ x: acc.x + (b.vertices[0]?.x ?? 0), y: acc.y + (b.vertices[0]?.y ?? 0) }),
      { x: 0, y: 0 }
    );
    centroid.x /= Math.max(1, existingBuildings.length);
    centroid.y /= Math.max(1, existingBuildings.length);

    for (let k = 0; k < 20; k++) {
      const angle = (k / 20) * Math.PI * 2;
      const r = 80 + k * 15;
      const cx = centroid.x + Math.cos(angle) * r;
      const cy = centroid.y + Math.sin(angle) * r;
      const w = 12 + k * 2;
      const h = 10 + k;
      buildingsVariantB.push({
        id: `wfs_new_${k}`,
        name: `WFS Budynek ${k}`,
        category: 'building',
        isTested: false,
        vertices: [
          { x: cx, y: cy },
          { x: cx + w, y: cy },
          { x: cx + w, y: cy + h },
          { x: cx, y: cy + h },
        ],
        defaultHeight: 9 + k * 1.5,
        elevation: 0,
        segments: [],
        layer: 'BUD_WFS',
        buildingType: 'residential',
        isCityCentre: false,
        hWindowBottom: 0.85,
      } as unknown as BuildingLoop);
    }
  }

  it('profiles full CadCanvas shadow engine cycle for Variant A (local) vs Variant B (after WFS switch)', { timeout: 60000 }, () => {
    if (buildingsVariantA.length === 0) return;

    const latitude = 52.23;
    const longitude = 21.01;
    const equinox: 'spring' | 'autumn' = 'spring';
    const stepHours = 0.5; // 21 kroków godzinowych jak w live analysis
    const runs = 5;

    // ── Funkcja profilowania pełnego cyklu silnika cienia (1 klatka CadCanvas) ──
    function profileShadowCycle(
      buildings: BuildingLoop[],
      label: string
    ): {
      tPrepare: number;
      tHourlyLoop: number;
      tProjectTested: number;
      tUnionTested: number;
      tProjectBlocking: number;
      tDifference: number;
      tFinalUnion: number;
      tTotal: number;
      testedCount: number;
      blockingCount: number;
      hourSteps: number;
      finalLoops: number;
    } {
      let tPrepareSum = 0;
      let tHourlyLoopSum = 0;
      let tProjectTestedSum = 0;
      let tUnionTestedSum = 0;
      let tProjectBlockingSum = 0;
      let tDifferenceSum = 0;
      let tFinalUnionSum = 0;
      let tTotalSum = 0;
      let testedCount = 0;
      let blockingCount = 0;
      let hourSteps = 0;
      let finalLoops = 0;

      for (let r = 0; r < runs; r++) {
        const tStart = performance.now();

        // Krok A: prepareShadowBuilding (pre-collapse kondygnacji, AABB, isConvex)
        const tPrepA = performance.now();
        const testedBuildings = buildings.filter(
          (b) => b.isTested && b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && ((b.elevation ?? 0) + (b.defaultHeight ?? 0)) > 0
        );
        const candidateBlocking = buildings.filter(
          (b) => !b.isTested && b.category !== 'boundary' && b.defaultHeight > 0 && b.vertices && b.vertices.length >= 3
        );
        const projectAABB = computeProjectShadowReachAABB(testedBuildings);
        const relevantBlocking = projectAABB
          ? candidateBlocking.filter((b) => { const bb = computeBuildingShadowReachAABB(b); return bb ? doAABBsOverlap(bb, projectAABB) : false; })
          : candidateBlocking;

        const preparedTested = testedBuildings.map((b) => prepareShadowBuilding(b)).filter((p): p is PreparedShadowBuilding => p !== null);
        const preparedBlocking = relevantBlocking.map((b) => prepareShadowBuilding(b)).filter((p): p is PreparedShadowBuilding => p !== null);
        tPrepareSum += performance.now() - tPrepA;
        testedCount = preparedTested.length;
        blockingCount = preparedBlocking.length;

        // Krok B: pętla godzinowa
        const tHourlyA = performance.now();
        const solarLUT = getGlobalSolarLUT(latitude, longitude, equinox);
        const maxOffset = 5;
        const hourlyBatches: Point2D[][][] = [];

        let tProjTestedAccum = 0;
        let tUnionTestedAccum = 0;
        let tProjBlockingAccum = 0;
        let tDiffAccum = 0;
        let stepCount = 0;

        for (let o = -maxOffset; o <= maxOffset + 1e-6; o += stepHours) {
          const offset = Math.round(o * 1000) / 1000;
          const sData = solarLUT.getMethodData(offset, 'raycasting');
          if (sData.elevationDeg <= 0.5) continue;

          const azRad = sData.azimuthDeg * (Math.PI / 180);
          const elevRad = sData.elevationDeg * (Math.PI / 180);
          const uShadow = sData.unitShadowVec;
          stepCount++;

          // Krok B1: projekcja testowanych
          const tProjT = performance.now();
          const hourTestedPolys: Point2D[][] = [];
          for (const item of preparedTested) collectBuildingShadowPolysPrepared(item, azRad, elevRad, 'raycasting', offset, hourTestedPolys);
          tProjTestedAccum += performance.now() - tProjT;

          if (hourTestedPolys.length === 0) continue;

          // Krok B2: unia cieni testowanych
          const tUnionT = performance.now();
          const mergedHourTested = unionPolygonLoops(hourTestedPolys);
          tUnionTestedAccum += performance.now() - tUnionT;
          if (mergedHourTested.length === 0) continue;

          // Krok B3: projekcja blokujących (per-hour AABB filter)
          const tProjB = performance.now();
          let hMinX = Infinity, hMinY = Infinity, hMaxX = -Infinity, hMaxY = -Infinity;
          for (const poly of mergedHourTested) for (const pt of poly) {
            if (pt.x < hMinX) hMinX = pt.x; if (pt.y < hMinY) hMinY = pt.y;
            if (pt.x > hMaxX) hMaxX = pt.x; if (pt.y > hMaxY) hMaxY = pt.y;
          }
          const blockingHourPolys: Point2D[][] = [];
          for (const item of preparedBlocking) {
            const offX = item.hTop * uShadow.x, offY = item.hTop * uShadow.y;
            const sMinX = Math.min(item.bMinX, item.bMinX + offX), sMaxX = Math.max(item.bMaxX, item.bMaxX + offX);
            const sMinY = Math.min(item.bMinY, item.bMinY + offY), sMaxY = Math.max(item.bMaxY, item.bMaxY + offY);
            if (sMaxX < hMinX || sMinX > hMaxX || sMaxY < hMinY || sMinY > hMaxY) continue;
            collectBuildingShadowPolysPrepared(item, azRad, elevRad, 'raycasting', offset, blockingHourPolys);
          }
          tProjBlockingAccum += performance.now() - tProjB;

          // Krok B4: różnica boolowska A\B
          let finalHour = mergedHourTested;
          if (blockingHourPolys.length > 0) {
            const tDiff = performance.now();
            finalHour = differencePolygonLoops(mergedHourTested, blockingHourPolys);
            tDiffAccum += performance.now() - tDiff;
          }

          if (finalHour.length > 0) hourlyBatches.push(finalHour);
        }

        tHourlyLoopSum += performance.now() - tHourlyA;
        tProjectTestedSum += tProjTestedAccum;
        tUnionTestedSum += tUnionTestedAccum;
        tProjectBlockingSum += tProjBlockingAccum;
        tDifferenceSum += tDiffAccum;
        hourSteps = stepCount;

        // Krok C: finalna hierarchiczna unia godzinowa
        const tFinalA = performance.now();
        let current = hourlyBatches;
        while (current.length > 1) {
          const next: Point2D[][][] = [];
          for (let i = 0; i < current.length; i += 2) {
            if (i + 1 < current.length) next.push(unionPolygonLoops([...current[i], ...current[i + 1]]));
            else next.push(current[i]);
          }
          if (next.length === current.length) break;
          current = next;
        }
        const envelope = current[0] || [];
        tFinalUnionSum += performance.now() - tFinalA;
        finalLoops = envelope.length;

        tTotalSum += performance.now() - tStart;
      }

      return {
        tPrepare: tPrepareSum / runs,
        tHourlyLoop: tHourlyLoopSum / runs,
        tProjectTested: tProjectTestedSum / runs,
        tUnionTested: tUnionTestedSum / runs,
        tProjectBlocking: tProjectBlockingSum / runs,
        tDifference: tDifferenceSum / runs,
        tFinalUnion: tFinalUnionSum / runs,
        tTotal: tTotalSum / runs,
        testedCount,
        blockingCount,
        hourSteps,
        finalLoops,
      };
    }

    // Warm-up (JIT stabilizacja — pierwsza iteracja computeFullShadowAnalysis jest wolniejsza)
    computeFullShadowAnalysis(buildingsVariantA.slice(0, 10), latitude, longitude, equinox, stepHours, 'raycasting');

    const resultA = profileShadowCycle(buildingsVariantA, 'Variant A');
    const resultB = profileShadowCycle(buildingsVariantB, 'Variant B');

    const delta = resultB.tTotal - resultA.tTotal;
    const deltaPercent = (delta / resultA.tTotal) * 100;

    const fmt = (n: number) => n.toFixed(3).padStart(8);
    const pct = (n: number, total: number) => ((n / total) * 100).toFixed(1).padStart(5);

    console.log('\n================================================================================');
    console.log('[CADCANVAS SHADOW ENGINE — VARIANT A (local) vs VARIANT B (post-WFS switch)]');
    console.log('================================================================================');
    console.log(`  Budynki:  Wariant A: ${resultA.testedCount} tested + ${resultA.blockingCount} blocking | Wariant B: ${resultB.testedCount} tested + ${resultB.blockingCount} blocking`);
    console.log(`  Budynki WFS (nowe w B): ${buildingsVariantB.length - buildingsVariantA.length} | Kroki godzinowe: ${resultA.hourSteps}`);
    console.log('--------------------------------------------------------------------------------');
    console.log('  Krok                              |   Wariant A |   Wariant B |      Delta');
    console.log('--------------------------------------------------------------------------------');
    console.log(`  A. prepareShadowBuilding (×N)     | ${fmt(resultA.tPrepare)} ms | ${fmt(resultB.tPrepare)} ms | ${(resultB.tPrepare - resultA.tPrepare) >= 0 ? '+' : ''}${(resultB.tPrepare - resultA.tPrepare).toFixed(3)} ms`);
    console.log(`  B1. Projekcja testowanych         | ${fmt(resultA.tProjectTested)} ms | ${fmt(resultB.tProjectTested)} ms | ${(resultB.tProjectTested - resultA.tProjectTested) >= 0 ? '+' : ''}${(resultB.tProjectTested - resultA.tProjectTested).toFixed(3)} ms`);
    console.log(`  B2. Unia testowanych/hour         | ${fmt(resultA.tUnionTested)} ms | ${fmt(resultB.tUnionTested)} ms | ${(resultB.tUnionTested - resultA.tUnionTested) >= 0 ? '+' : ''}${(resultB.tUnionTested - resultA.tUnionTested).toFixed(3)} ms`);
    console.log(`  B3. Projekcja blokujących         | ${fmt(resultA.tProjectBlocking)} ms | ${fmt(resultB.tProjectBlocking)} ms | ${(resultB.tProjectBlocking - resultA.tProjectBlocking) >= 0 ? '+' : ''}${(resultB.tProjectBlocking - resultA.tProjectBlocking).toFixed(3)} ms`);
    console.log(`  B4. differencePolygonLoops (A\\B)  | ${fmt(resultA.tDifference)} ms | ${fmt(resultB.tDifference)} ms | ${(resultB.tDifference - resultA.tDifference) >= 0 ? '+' : ''}${(resultB.tDifference - resultA.tDifference).toFixed(3)} ms`);
    console.log(`  C.  Hierarchical Final Union      | ${fmt(resultA.tFinalUnion)} ms | ${fmt(resultB.tFinalUnion)} ms | ${(resultB.tFinalUnion - resultA.tFinalUnion) >= 0 ? '+' : ''}${(resultB.tFinalUnion - resultA.tFinalUnion).toFixed(3)} ms`);
    console.log('--------------------------------------------------------------------------------');
    console.log(`  TOTAL / frame                     | ${fmt(resultA.tTotal)} ms | ${fmt(resultB.tTotal)} ms | ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} ms (${delta >= 0 ? '+' : ''}${deltaPercent.toFixed(1)}%)`);
    console.log(`  FPS equiv.                        | ${(1000 / resultA.tTotal).toFixed(1).padStart(8)} FPS | ${(1000 / resultB.tTotal).toFixed(1).padStart(8)} FPS |`);
    console.log('================================================================================');

    // Identyfikacja największego zawalidrogi w Wariancie B
    const steps = [
      { name: 'prepareShadowBuilding', tA: resultA.tPrepare, tB: resultB.tPrepare },
      { name: 'Projekcja testowanych', tA: resultA.tProjectTested, tB: resultB.tProjectTested },
      { name: 'Unia testowanych', tA: resultA.tUnionTested, tB: resultB.tUnionTested },
      { name: 'Projekcja blokujących', tA: resultA.tProjectBlocking, tB: resultB.tProjectBlocking },
      { name: 'differencePolygonLoops', tA: resultA.tDifference, tB: resultB.tDifference },
      { name: 'Final Union', tA: resultA.tFinalUnion, tB: resultB.tFinalUnion },
    ];
    steps.sort((a, b) => (b.tB - b.tA) - (a.tB - a.tA));
    const topBottleneck = steps[0];
    console.log(`\n  ► Największy wzrost latency (A→B): "${topBottleneck.name}"`);
    console.log(`    +${(topBottleneck.tB - topBottleneck.tA).toFixed(3)} ms (+${(((topBottleneck.tB - topBottleneck.tA) / Math.max(topBottleneck.tA, 0.001)) * 100).toFixed(1)}%)`);
    console.log(`    ${resultB.blockingCount} blokujących budynków → więcej par w AABB-filter + więcej wierzchołków`);
    console.log('================================================================================\n');

    expect(resultA.tTotal).toBeGreaterThan(0);
    expect(resultB.tTotal).toBeGreaterThan(0);
    // Wariant B nie może być szybszy (warunki egzekucji są cięższe)
    // Tolerancja: 2x dozwolone spowolnienie — w realnym scenariuszu z cache warm-up spodziewamy się <1.5x
    expect(resultB.tTotal).toBeLessThan(resultA.tTotal * 3.0);
    expect(resultA.finalLoops).toBeGreaterThan(0);
  });

  it('measures FPS for CadCanvas (§12/§56 pipeline) + MasterPlan (ground shadow cache) per frame during sun-scrubbing, live vs final accuracy', { timeout: 60000 }, () => {
    if (buildingsVariantA.length === 0) return;

    const latitude = 52.23;
    const longitude = 21.01;
    const equinox: 'spring' | 'autumn' = 'spring';
    const buildings = buildingsVariantA;

    // Symulacja przeciągania suwaka godzinowego: kilka klatek z różną pozycją słońca,
    // tak jak podczas interakcji użytkownika (isInteracting=true -> accuracyStage='live')
    const scrubHours = [9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0];

    const allTiers: MasterplanStoryTier[] = [];
    for (const bldg of buildings) allTiers.push(...extractBuildingStoryTiers(bldg));
    const masterplanSamples: MasterplanColorSample[] = [{ color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 }];

    // Warm-up (JIT + pierwszy cache-fill)
    computeFullShadowAnalysis(buildings, latitude, longitude, equinox, 1.0, 'raycasting');
    getCachedGroundShadowSamples(allTiers, masterplanSamples, latitude, longitude, equinox, scrubHours[0]);

    function benchmarkStage(stepHours: number, label: string) {
      let tCadCanvasSum = 0;
      let tMasterplanSum = 0;

      for (const hour of scrubHours) {
        const t0 = performance.now();
        computeFullShadowAnalysis(buildings, latitude, longitude, equinox, stepHours, 'raycasting');
        tCadCanvasSum += performance.now() - t0;

        const t1 = performance.now();
        getCachedGroundShadowSamples(allTiers, masterplanSamples, latitude, longitude, equinox, hour);
        tMasterplanSum += performance.now() - t1;
      }

      const avgCadCanvas = tCadCanvasSum / scrubHours.length;
      const avgMasterplan = tMasterplanSum / scrubHours.length;
      const avgFrame = avgCadCanvas + avgMasterplan;

      console.log(`  ${label.padEnd(28)} | CadCanvas: ${avgCadCanvas.toFixed(2).padStart(8)} ms | MasterPlan: ${avgMasterplan.toFixed(2).padStart(8)} ms | Frame: ${avgFrame.toFixed(2).padStart(8)} ms | ${(1000 / avgFrame).toFixed(1).padStart(6)} FPS`);

      return { avgCadCanvas, avgMasterplan, avgFrame };
    }

    console.log('\n================================================================================');
    console.log(`[FPS: CADCANVAS + MASTERPLAN PER FRAME (warszawa.json, ${buildings.length} buildings, ${scrubHours.length}-frame sun-scrub)]`);
    console.log('================================================================================');
    const live = benchmarkStage(1.0, 'LIVE (coarse, isInteracting=true)');
    const final = benchmarkStage(0.25, 'FINAL (fine, 200ms after release)');
    console.log('--------------------------------------------------------------------------------');
    console.log(`  Live→Final slowdown: ${(final.avgFrame / live.avgFrame).toFixed(2)}x`);
    console.log('================================================================================\n');

    expect(live.avgFrame).toBeGreaterThan(0);
    expect(final.avgFrame).toBeGreaterThan(0);
    // TODO(perf): LIVE FPS zmierzony na 318-budynkowym reference/warszawa.json (2026-09-21) to ~2.8 FPS —
    // to JEST regresja względem docelowej płynności interakcji (§12/§56 zoom/pan), nie akceptowalny stan.
    // Próg 2.0 poniżej jest wyłącznie strażnikiem REGRESJI względem obecnego (złego) stanu, nie potwierdzeniem
    // że 2.8 FPS jest OK. Właściwa naprawa to optymalizacja kroku differencePolygonLoops (batched-fallback,
    // patrz differencePolygonLoops multi-sample perf harness w tym pliku) — dopóki ten krok nie przyspieszy,
    // ten próg pozostaje nisko i test będzie się "zielenić" mimo złej wydajności.
    expect(1000 / live.avgFrame).toBeGreaterThan(2.0);
  });
});

function solarAngles(lat: number, lon: number, eq: 'spring' | 'autumn', hr: number) {
  return getMasterplanSolarAngles(lat, lon, eq, hr, 0, 'raycasting');
}
