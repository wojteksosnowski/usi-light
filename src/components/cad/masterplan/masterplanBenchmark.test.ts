import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractBuildingStoryTiers, MasterplanStoryTier } from './masterplanGeometry';
import { getCachedGroundShadowSamples, MasterplanColorSample } from './masterplanShadowCache';
import { BuildingLoop } from '../../../types/geometry';

describe('Masterplan Shadow Performance Benchmark on warszawa.json', () => {
  it('benchmarks legacy vs soft (cone jiggle) on real-world large scene', () => {
    const filePath = path.resolve(__dirname, '../../../../reference/warszawa.json');
    if (!fs.existsSync(filePath)) {
      console.log('File reference/warszawa.json not found, skipping benchmark.');
      return;
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const buildings: BuildingLoop[] = (rawData.buildings || []).filter(
      (b: any) => b.category !== 'boundary' && b.vertices && b.vertices.length >= 3 && (b.defaultHeight || 0) > 0
    );

    console.log(`[BENCHMARK] Loaded ${buildings.length} 3D buildings from warszawa.json`);

    const allTiers: MasterplanStoryTier[] = [];
    for (const bldg of buildings) {
      allTiers.push(...extractBuildingStoryTiers(bldg));
    }
    console.log(`[BENCHMARK] Extracted ${allTiers.length} story tiers`);

    const samples: MasterplanColorSample[] = [
      { color: 'rgba(30, 41, 59, 0.08)', offsetMin: -1 },
      { color: 'rgba(30, 41, 59, 0.14)', offsetMin: 0 },
      { color: 'rgba(30, 41, 59, 0.08)', offsetMin: 1 },
    ];

    // Warm-up
    getCachedGroundShadowSamples('legacy', allTiers, samples, 52.23, 21.01, 'spring', 12.0);
    getCachedGroundShadowSamples('soft', allTiers, samples, 52.23, 21.01, 'spring', 12.0);

    // Test different hour angles (sun moving) - cache miss scenario per frame
    const hours = [10.0, 11.0, 12.0, 13.0, 14.0];

    // 1. Benchmark Legacy
    const t0Legacy = performance.now();
    for (const h of hours) {
      getCachedGroundShadowSamples('legacy', allTiers, samples, 52.23, 21.01, 'spring', h);
    }
    const legacyTime = (performance.now() - t0Legacy) / hours.length;

    // 2. Benchmark Soft (Cone Jiggle)
    const t0Soft = performance.now();
    for (const h of hours) {
      getCachedGroundShadowSamples('soft', allTiers, samples, 52.23, 21.01, 'spring', h);
    }
    const softTime = (performance.now() - t0Soft) / hours.length;

    console.log(`[BENCHMARK_RESULT] Average computation time per sun position frame:`);
    console.log(`  - Legacy (Obecny):      ${legacyTime.toFixed(2)} ms`);
    console.log(`  - Soft (Cone Jiggle):  ${softTime.toFixed(2)} ms`);
    console.log(`  - Ratio (Soft / Legacy): ${(softTime / legacyTime).toFixed(2)}x`);
  }, 30000);
});
