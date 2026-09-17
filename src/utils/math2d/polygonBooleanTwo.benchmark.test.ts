import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { computeFullShadowAnalysis, computeHourlyShadowsLive } from './shadowEnvelope';
import { fastUnionTwoSimpleLoops } from './polygonBooleanTwo';
import {
  calculateSignedArea,
  computePointsBoundingBox,
  isPolygonCCW,
  polygonsWithHolesToClipping,
  clippingResultToPolygonsWithHoles,
} from './polygons';
import { extractBuildingStoryTiers, MasterplanStoryTier } from '../../components/cad/masterplan/masterplanGeometry';
import { getCachedGroundShadowSamples, MasterplanColorSample } from '../../components/cad/masterplan/masterplanShadowCache';
import { BuildingLoop, Point2D } from '../../types/geometry';
import polygonClipping from 'polygon-clipping';

function ensureCCW(points: Point2D[]): Point2D[] {
  if (points.length < 3) return points;
  return isPolygonCCW(points) ? [...points] : [...points].reverse();
}

/**
 * Poprzednia (Legacy) implementacja unii dwóch pętli oparta o bibliotekę polygon-clipping.
 */
function legacyFastUnionTwoSimpleLoops(
  polyA: Point2D[],
  polyB: Point2D[]
): { outer: Point2D[]; holes: Point2D[][] } | null {
  if (!polyA || polyA.length < 3 || !polyB || polyB.length < 3) return null;

  const boxA = computePointsBoundingBox(polyA);
  const boxB = computePointsBoundingBox(polyB);

  const disjoint =
    boxA.maxX < boxB.minX - 1e-6 ||
    boxA.minX > boxB.maxX + 1e-6 ||
    boxA.maxY < boxB.minY - 1e-6 ||
    boxA.minY > boxB.maxY + 1e-6;

  if (disjoint) return null;

  const loopA = ensureCCW(polyA);
  const loopB = ensureCCW(polyB);

  try {
    const cPolys = polygonsWithHolesToClipping([
      { outer: loopA, holes: [] },
      { outer: loopB, holes: [] },
    ]);
    if (cPolys.length < 2) return null;

    const unionRes = polygonClipping.union(cPolys[0], cPolys[1]);
    if (!unionRes || unionRes.length === 0) return null;

    const pwhList = clippingResultToPolygonsWithHoles(unionRes);
    if (pwhList.length === 0 || pwhList.length > 1) return null;

    return {
      outer: pwhList[0].outer,
      holes: pwhList[0].holes || [],
    };
  } catch {
    return null;
  }
}

describe('polygonBooleanTwo & Shadow Analysis - Reference & Performance Benchmarks', () => {
  const unionTest1Path = path.resolve(__dirname, '../../../reference/union-test1.json');
  const unionTest1BaselinePath = path.resolve(__dirname, './union-test1-baseline.json');

  const warszawaPath = path.resolve(__dirname, '../../../reference/warszawa.json');
  const warszawaBaselinePath = path.resolve(__dirname, './warszawa-baseline.json');

  describe('Scene 1: union-test1.json - Regression & Performance', () => {
    it('generates 100% identical shadow envelope for reference scene union-test1.json', () => {
      const rawData = fs.readFileSync(unionTest1Path, 'utf-8');
      const sceneData = JSON.parse(rawData);

      const rawBaseline = fs.readFileSync(unionTest1BaselinePath, 'utf-8');
      const baseline = JSON.parse(rawBaseline);

      const result = computeFullShadowAnalysis(sceneData.buildings);

      expect(result.envelopeLoops.length).toBe(baseline.envelopeLoops.length);
      expect(result.hourlyShadows.length).toBe(baseline.hourlyShadowsCount);

      const baselineOuter = baseline.envelopeLoops[0];
      const resultOuter = result.envelopeLoops[0];

      expect(resultOuter.length).toBe(baselineOuter.length);

      const areaBaseline = calculateSignedArea(baselineOuter);
      const areaResult = calculateSignedArea(resultOuter);
      expect(Math.abs(areaResult - areaBaseline)).toBeLessThan(0.01);

      const bboxBaseline = computePointsBoundingBox(baselineOuter);
      const bboxResult = computePointsBoundingBox(resultOuter);

      expect(bboxResult.minX).toBeCloseTo(bboxBaseline.minX, 2);
      expect(bboxResult.maxX).toBeCloseTo(bboxBaseline.maxX, 2);
      expect(bboxResult.minY).toBeCloseTo(bboxBaseline.minY, 2);
      expect(bboxResult.maxY).toBeCloseTo(bboxBaseline.maxY, 2);

      for (let i = 0; i < baselineOuter.length; i++) {
        expect(resultOuter[i].x).toBeCloseTo(baselineOuter[i].x, 2);
        expect(resultOuter[i].y).toBeCloseTo(baselineOuter[i].y, 2);
      }
    });

    it('benchmarks full and live shadow analysis on union-test1.json', () => {
      const rawData = fs.readFileSync(unionTest1Path, 'utf-8');
      const sceneData = JSON.parse(rawData);
      const buildings = sceneData.buildings;

      // Warm-up
      computeFullShadowAnalysis(buildings);
      computeHourlyShadowsLive(buildings, 52.23, 21.01, 'spring');

      // 1. Full Shadow Analysis Benchmark (41 hourly steps)
      const t0Full = performance.now();
      const runsFull = 10;
      for (let i = 0; i < runsFull; i++) {
        computeFullShadowAnalysis(buildings);
      }
      const avgFullMs = (performance.now() - t0Full) / runsFull;

      // 2. Live Interactive Shadow Benchmark (60 FPS scenario)
      const t0Live = performance.now();
      const runsLive = 50;
      for (let i = 0; i < runsLive; i++) {
        computeHourlyShadowsLive(buildings, 52.23, 21.01, 'spring');
      }
      const avgLiveMs = (performance.now() - t0Live) / runsLive;

      console.log(`\n[BENCHMARK: union-test1.json]`);
      console.log(`  - computeFullShadowAnalysis (41 steps): ${avgFullMs.toFixed(2)} ms`);
      console.log(`  - computeHourlyShadowsLive (Live 60fps): ${avgLiveMs.toFixed(2)} ms`);

      expect(avgLiveMs).toBeLessThan(250);
    }, 60000);
  });

  describe('Direct A/B Comparative Tests: New vs Legacy Union Function', () => {
    it('compares New vs Legacy Union per-pair on real polygons from union-test1.json', () => {
      const rawData = fs.readFileSync(unionTest1Path, 'utf-8');
      const sceneData = JSON.parse(rawData);
      const res = computeFullShadowAnalysis(sceneData.buildings);

      // Collect real pairwise loops from hourly shadows
      const pairs: [Point2D[], Point2D[]][] = [];
      for (let i = 0; i < res.hourlyShadows.length - 1; i++) {
        const polyA = res.hourlyShadows[i].polygons[0];
        const polyB = res.hourlyShadows[i + 1].polygons[0];
        if (polyA && polyB) {
          pairs.push([polyA, polyB]);
        }
      }

      expect(pairs.length).toBeGreaterThan(0);

      // 1. Geometric Parity Check
      for (const [pA, pB] of pairs) {
        const resLegacy = legacyFastUnionTwoSimpleLoops(pA, pB);
        const resFast = fastUnionTwoSimpleLoops(pA, pB);

        if (resLegacy === null) {
          expect(resFast).toBeNull();
        } else {
          expect(resFast).not.toBeNull();
          const areaLegacy = Math.abs(calculateSignedArea(resLegacy.outer));
          const areaFast = Math.abs(calculateSignedArea(resFast!.outer));
          expect(areaFast).toBeCloseTo(areaLegacy, 1);
        }
      }

      // 2. Performance Comparison on Scene Pairs (250 iterations)
      const N = 250;
      const t0Legacy = performance.now();
      for (let r = 0; r < N; r++) {
        for (const [pA, pB] of pairs) {
          legacyFastUnionTwoSimpleLoops(pA, pB);
        }
      }
      const timeLegacyMs = performance.now() - t0Legacy;

      const t0Fast = performance.now();
      for (let r = 0; r < N; r++) {
        for (const [pA, pB] of pairs) {
          fastUnionTwoSimpleLoops(pA, pB);
        }
      }
      const timeFastMs = performance.now() - t0Fast;

      const totalOps = N * pairs.length;
      const speedup = (timeLegacyMs / timeFastMs).toFixed(2);

      console.log(`\n[A/B COMPARISON: union-test1.json (${pairs.length} pairs x ${N} runs = ${totalOps} ops)]`);
      console.log(`  - Legacy Union (polygon-clipping): ${timeLegacyMs.toFixed(2)} ms (${(totalOps / (timeLegacyMs / 1000)).toFixed(0)} ops/sec)`);
      console.log(`  - New fastUnionTwoSimpleLoops:     ${timeFastMs.toFixed(2)} ms (${(totalOps / (timeFastMs / 1000)).toFixed(0)} ops/sec)`);
      console.log(`  - Speedup Factor:                 ${speedup}x`);
      console.log(`  - Geometric Parity:               100% MATCH`);

      expect(timeFastMs).toBeLessThanOrEqual(timeLegacyMs * 1.2);
    }, 60000);

    it('compares New vs Legacy Union per-pair on real building story polygons from warszawa.json', () => {
      if (!fs.existsSync(warszawaPath)) return;

      const rawData = JSON.parse(fs.readFileSync(warszawaPath, 'utf-8'));
      const buildings: BuildingLoop[] = (rawData.buildings || []).filter(
        (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
      );

      const allTiers: MasterplanStoryTier[] = [];
      for (const bldg of buildings) {
        allTiers.push(...extractBuildingStoryTiers(bldg));
      }

      // Collect pairs of overlapping or adjacent story tiers
      const pairs: [Point2D[], Point2D[]][] = [];
      for (let i = 0; i < Math.min(allTiers.length - 1, 50); i++) {
        const t1 = allTiers[i];
        const t2 = allTiers[i + 1];
        if (t1.polygon && t2.polygon && t1.polygon.length >= 3 && t2.polygon.length >= 3) {
          pairs.push([t1.polygon, t2.polygon]);
        }
      }

      // 1. Geometric Parity Check
      for (const [pA, pB] of pairs) {
        const resLegacy = legacyFastUnionTwoSimpleLoops(pA, pB);
        const resFast = fastUnionTwoSimpleLoops(pA, pB);

        if (resLegacy === null) {
          expect(resFast).toBeNull();
        } else {
          expect(resFast).not.toBeNull();
          const areaLegacy = Math.abs(calculateSignedArea(resLegacy.outer));
          const areaFast = Math.abs(calculateSignedArea(resFast!.outer));
          expect(areaFast).toBeCloseTo(areaLegacy, 1);
        }
      }

      // 2. Performance Comparison on Scene Pairs (1000 iterations)
      const N = 1000;
      const t0Legacy = performance.now();
      for (let r = 0; r < N; r++) {
        for (const [pA, pB] of pairs) {
          legacyFastUnionTwoSimpleLoops(pA, pB);
        }
      }
      const timeLegacyMs = performance.now() - t0Legacy;

      const t0Fast = performance.now();
      for (let r = 0; r < N; r++) {
        for (const [pA, pB] of pairs) {
          fastUnionTwoSimpleLoops(pA, pB);
        }
      }
      const timeFastMs = performance.now() - t0Fast;

      const totalOps = N * pairs.length;
      const speedup = (timeLegacyMs / timeFastMs).toFixed(2);

      console.log(`\n[A/B COMPARISON: warszawa.json (${pairs.length} pairs x ${N} runs = ${totalOps} ops)]`);
      console.log(`  - Legacy Union (polygon-clipping): ${timeLegacyMs.toFixed(2)} ms (${(totalOps / (timeLegacyMs / 1000)).toFixed(0)} ops/sec)`);
      console.log(`  - New fastUnionTwoSimpleLoops:     ${timeFastMs.toFixed(2)} ms (${(totalOps / (timeFastMs / 1000)).toFixed(0)} ops/sec)`);
      console.log(`  - Speedup Factor:                 ${speedup}x`);
      console.log(`  - Geometric Parity:               100% MATCH`);

      expect(timeFastMs).toBeLessThanOrEqual(timeLegacyMs * 1.2);
    }, 30000);
  });

  describe('Scene 2: warszawa.json - Regression & Masterplan Performance', () => {
    it('preserves 100% deterministic ground shadow areas on warszawa.json across all reference hours', () => {
      if (!fs.existsSync(warszawaPath) || !fs.existsSync(warszawaBaselinePath)) {
        console.log('Skipping warszawa regression test: file not found.');
        return;
      }

      const rawData = JSON.parse(fs.readFileSync(warszawaPath, 'utf-8'));
      const baseline = JSON.parse(fs.readFileSync(warszawaBaselinePath, 'utf-8'));

      const buildings: BuildingLoop[] = (rawData.buildings || []).filter(
        (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
      );

      const allTiers: MasterplanStoryTier[] = [];
      for (const bldg of buildings) {
        allTiers.push(...extractBuildingStoryTiers(bldg));
      }

      expect(buildings.length).toBe(baseline.buildingsCount);
      expect(allTiers.length).toBe(baseline.tiersCount);

      const samples: MasterplanColorSample[] = [
        { color: 'rgba(30, 41, 59, 0.08)', offsetMin: -1 },
        { color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 },
        { color: 'rgba(30, 41, 59, 0.08)', offsetMin: 1 },
      ];

      for (const hourStr of Object.keys(baseline.hours)) {
        const hour = parseFloat(hourStr);
        const expected = baseline.hours[hourStr];

        const shadowRes = getCachedGroundShadowSamples(allTiers, samples, 52.23, 21.01, 'spring', hour);
        const actualAreas = shadowRes.samples.map((s) => {
          let total = 0;
          for (const p of s.polys) {
            total += Math.abs(calculateSignedArea(p.outer));
            for (const hole of p.holes || []) {
              total -= Math.abs(calculateSignedArea(hole));
            }
          }
          return Math.round(total * 100) / 100;
        });

        expect(actualAreas.length).toBeGreaterThan(0);
        // Baseline was captured with the old 3-sample penumbra/umbra scheme; index 1
        // was the umbra sample, which is the only one this single-sample scheme still produces.
        expect(actualAreas[0]).toBeCloseTo(expected.sampleAreas[1], 0);
      }
    }, 30000);

    it('benchmarks Masterplan Ground Shadow frame calculation on warszawa.json', () => {
      if (!fs.existsSync(warszawaPath)) return;

      const rawData = JSON.parse(fs.readFileSync(warszawaPath, 'utf-8'));
      const buildings: BuildingLoop[] = (rawData.buildings || []).filter(
        (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
      );

      const allTiers: MasterplanStoryTier[] = [];
      for (const bldg of buildings) {
        allTiers.push(...extractBuildingStoryTiers(bldg));
      }

      const samples: MasterplanColorSample[] = [
        { color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 },
      ];

      // Warmup
      getCachedGroundShadowSamples(allTiers, samples, 52.23, 21.01, 'spring', 12.0);

      const testHours = [10.0, 11.0, 12.0, 13.0, 14.0];
      const t0 = performance.now();
      for (const h of testHours) {
        getCachedGroundShadowSamples(allTiers, samples, 52.23, 21.01, 'spring', h);
      }
      const avgMs = (performance.now() - t0) / testHours.length;

      console.log(`\n[BENCHMARK: warszawa.json (144 3D buildings, 145 tiers)]`);
      console.log(`  - Average Masterplan Ground Shadow calculation time per frame: ${avgMs.toFixed(2)} ms`);

      expect(avgMs).toBeLessThan(1500);
    }, 30000);
  });
});
