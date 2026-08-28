import { describe, it } from 'vitest';
import { createSampleBuildings } from '../src/utils/dxfParser';
import { sampleSegmentPoints } from '../src/utils/math2d';
import { analyzeShadowingAtPoint, analyzeSunlightAtPoint } from '../src/engine/analysisEngine';
import { ProjectSettings } from '../src/types/geometry';

describe('Performance Benchmark: Przesłanianie (§ 12) vs Nasłonecznienie (§ 56)', () => {
  it('measures CPU execution time comparison', () => {
    const buildings = createSampleBuildings();
    const target = buildings[0];
    const settings: ProjectSettings = {
      latitude: 52.23,
      longitude: 21.01,
      isCityCentreDefault: false,
      samplingInterval: 0.25,
      equinoxDate: 'spring',
    };

    // Generate sample points on target building
    const points: { point: any; seg: any; ratio: number }[] = [];
    for (const seg of target.segments) {
      const sampled = sampleSegmentPoints(seg.p1, seg.p2, 0.25);
      for (const s of sampled) {
        points.push({ point: s.point, seg, ratio: s.ratio });
      }
    }

    const iterations = 50;
    const totalPoints = points.length * iterations;

    // 1. Warm-up
    for (let i = 0; i < 5; i++) {
      for (const p of points) {
        analyzeShadowingAtPoint(p.point, p.seg, p.ratio, buildings, target.id, 0.5);
        analyzeSunlightAtPoint(p.point, p.seg, p.ratio, buildings, target.id, settings, 5);
      }
    }

    // 2. Measure Shadowing (§ 12) at high precision (angleStep = 0.5 deg -> 313 rays/point)
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (const p of points) {
        analyzeShadowingAtPoint(p.point, p.seg, p.ratio, buildings, target.id, 0.5);
      }
    }
    const t1 = performance.now();
    const shadowingTimeHigh = t1 - t0;

    // 3. Measure Shadowing (§ 12) at live precision (angleStep = 2.0 deg -> 79 rays/point)
    const t0Live = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (const p of points) {
        analyzeShadowingAtPoint(p.point, p.seg, p.ratio, buildings, target.id, 2.0);
      }
    }
    const t1Live = performance.now();
    const shadowingTimeLive = t1Live - t0Live;

    // 4. Measure Sunlight (§ 56) at high precision (stepMinutes = 5 min -> ~120 solar checks)
    const t2 = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (const p of points) {
        analyzeSunlightAtPoint(p.point, p.seg, p.ratio, buildings, target.id, settings, 5);
      }
    }
    const t3 = performance.now();
    const sunlightTimeHigh = t3 - t2;

    // 5. Measure Sunlight (§ 56) at live precision (stepMinutes = 15 min -> ~40 solar checks)
    const t2Live = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (const p of points) {
        analyzeSunlightAtPoint(p.point, p.seg, p.ratio, buildings, target.id, settings, 15);
      }
    }
    const t3Live = performance.now();
    const sunlightTimeLive = t3Live - t2Live;

    console.log(`\n================ BENCHMARK PROFILING RESULTS (${totalPoints} punktów pomiarowych) ================`);
    console.log(`[TRYB DOKŁADNY - HIGH PRECISION]:`);
    console.log(`- Przesłanianie § 12 (krok 0.5° = 313 promieni): ${shadowingTimeHigh.toFixed(2)} ms (${(shadowingTimeHigh / totalPoints * 1000).toFixed(2)} µs/pkt)`);
    console.log(`- Nasłonecznienie § 56 (krok 5 min = 120 slotów):  ${sunlightTimeHigh.toFixed(2)} ms (${(sunlightTimeHigh / totalPoints * 1000).toFixed(2)} µs/pkt)`);
    console.log(`=> Przesłanianie zajmuje ${(shadowingTimeHigh / sunlightTimeHigh * 100).toFixed(1)}% czasu Nasłonecznienia (${(shadowingTimeHigh / sunlightTimeHigh).toFixed(2)}x)`);
    console.log(`\n[TRYB SZYBKI - LIVE]:`);
    console.log(`- Przesłanianie § 12 (krok 2.0° = 79 promieni):   ${shadowingTimeLive.toFixed(2)} ms (${(shadowingTimeLive / totalPoints * 1000).toFixed(2)} µs/pkt)`);
    console.log(`- Nasłonecznienie § 56 (krok 15 min = 40 slotów):  ${sunlightTimeLive.toFixed(2)} ms (${(sunlightTimeLive / totalPoints * 1000).toFixed(2)} µs/pkt)`);
    console.log(`=> Przesłanianie zajmuje ${(shadowingTimeLive / sunlightTimeLive * 100).toFixed(1)}% czasu Nasłonecznienia (${(shadowingTimeLive / sunlightTimeLive).toFixed(2)}x)`);
    console.log(`===================================================================================\n`);
  });
});
