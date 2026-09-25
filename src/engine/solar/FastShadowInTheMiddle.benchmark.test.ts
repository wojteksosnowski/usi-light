import { describe, it, expect } from 'vitest';
import { FastShadowInTheMiddle } from './FastShadowInTheMiddle';
import { CanonicalShadowBaker } from '../compiler/CanonicalShadowBaker';
import { MasterplanFastShadowPipeline } from '@/components/cad/masterplan/masterplanFastShadowPipeline';
import { Point2D } from '@/types/geometry';
import { calculateSignedArea } from '@/utils/math2d/polygons';

describe('FastShadowInTheMiddle - Performance & Drill-Down Benchmark', () => {
  const squareBase: Point2D[] = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
  ];

  const shadowVector: Point2D = { x: 1.2, y: 0.8 };
  const zMax = 45;
  const zMin = 0;

  const component = CanonicalShadowBaker.bakeComponent(
    'bldg_bench_comp',
    'bldg_bench',
    zMin,
    zMax,
    squareBase,
    undefined,
    shadowVector
  );

  it('measures in-flight projection speed (ops/sec and nanoseconds per vertex)', () => {
    const iterations = 50000;
    const testHeights = [5, 12.5, 20, 32, 40];

    const start = performance.now();
    let totalProjectedRings = 0;

    for (let i = 0; i < iterations; i++) {
      const zTarget = testHeights[i % testHeights.length];
      const res = FastShadowInTheMiddle.projectComponentToPlane(component, zTarget);
      if (res) totalProjectedRings++;
    }

    const elapsed = performance.now() - start;
    const opsPerSec = Math.round((iterations / elapsed) * 1000);
    const nsPerOp = (elapsed / iterations) * 1e6;
    const nsPerVertex = nsPerOp / 4;

    console.log(`\n================================================================================`);
    console.log(`[FAST SHADOW IN THE MIDDLE - IN-FLIGHT PROJECTION BENCHMARK]`);
    console.log(`================================================================================`);
    console.log(`  Iterations:             ${iterations}`);
    console.log(`  Total time:             ${elapsed.toFixed(3)} ms`);
    console.log(`  Throughput:             ${opsPerSec.toLocaleString()} projections/sec`);
    console.log(`  Latency per projection: ${nsPerOp.toFixed(1)} ns`);
    console.log(`  Latency per vertex:     ${nsPerVertex.toFixed(1)} ns ($O(1)$ affine translation)`);
    console.log(`================================================================================\n`);

    expect(totalProjectedRings).toBe(iterations);
    expect(opsPerSec).toBeGreaterThan(100000); // Expect > 100k ops/sec
  });

  it('benchmarks full MasterplanFastShadowPipeline roof shadow calculation', () => {
    const casterBuildingShadow = CanonicalShadowBaker.bakeBuildingShadow(
      'caster_bldg',
      [],
      squareBase,
      undefined,
      45,
      0,
      'test_sun',
      shadowVector
    );

    const targetRoofPoly: Point2D[] = [
      { x: 15, y: 10 },
      { x: 35, y: 10 },
      { x: 35, y: 30 },
      { x: 15, y: 30 },
    ];

    const iterations = 2000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      MasterplanFastShadowPipeline.calculateShadowOnRoof(
        [casterBuildingShadow],
        {
          buildingId: 'target_bldg',
          roofHeight: 20,
          roofPolygon: targetRoofPoly,
        }
      );
    }

    const elapsed = performance.now() - start;
    const opsPerSec = Math.round((iterations / elapsed) * 1000);

    console.log(`\n================================================================================`);
    console.log(`[MASTERPLAN FAST SHADOW PIPELINE - ROOF SHADOW BENCHMARK]`);
    console.log(`================================================================================`);
    console.log(`  Iterations:             ${iterations} roof-shadow calculations`);
    console.log(`  Total time:             ${elapsed.toFixed(3)} ms`);
    console.log(`  Throughput:             ${opsPerSec.toLocaleString()} calculations/sec`);
    console.log(`================================================================================\n`);

    expect(opsPerSec).toBeGreaterThan(5000);
  });
});
