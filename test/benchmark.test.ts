import { describe, it } from 'vitest';
import { createSampleBuildings } from '../src/utils/dxfParser';
import { sampleSegmentPoints } from '../src/utils/math2d';
import { analyzeShadowingAtPoint, analyzeSunlightAtPoint, analyzeSunlightAtPointSegments } from '../src/engine/analysisEngine';
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

    const iterations = 5;
    const totalPoints = points.length * iterations;

    // 1. Warm-up
    for (let i = 0; i < 2; i++) {
      for (const p of points) {
        analyzeShadowingAtPoint(p.point, p.seg, p.ratio, buildings, target.id, 0.5);
        analyzeSunlightAtPoint(p.point, p.seg, p.ratio, buildings, target.id, settings, 5);
        analyzeSunlightAtPointSegments(p.point, p.seg, p.ratio, buildings, target.id, settings);
      }
    }

    // 2. Measure Shadowing (§ 12) at high precision
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (const p of points) {
        analyzeShadowingAtPoint(p.point, p.seg, p.ratio, buildings, target.id, 0.5);
      }
    }
    const t1 = performance.now();
    const shadowingTime = t1 - t0;

    // 3. Measure Linijka Słońca (§ 56 Segmenty - czysto analityczna)
    const t2 = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (const p of points) {
        analyzeSunlightAtPointSegments(p.point, p.seg, p.ratio, buildings, target.id, settings);
      }
    }
    const t3 = performance.now();
    const sunlightSegTime = t3 - t2;

    console.log(`\n================ BENCHMARK PROFILING RESULTS (${totalPoints} punktów pomiarowych) ================`);
    console.log(`- Przesłanianie § 12 (analityczne/sektory):       ${shadowingTime.toFixed(2)} ms (${(shadowingTime / totalPoints * 1000).toFixed(2)} µs/pkt)`);
    console.log(`- Linijka Słońca § 56 (czysto analityczna 1D):    ${sunlightSegTime.toFixed(2)} ms (${(sunlightSegTime / totalPoints * 1000).toFixed(2)} µs/pkt)`);
    console.log(`===================================================================================\n`);
  }, 10000);
});

