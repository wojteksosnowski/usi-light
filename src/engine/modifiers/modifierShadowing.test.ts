import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { defaultSolarAnalysisEngine } from '../solar';
import { analyzeShadowingAtPoint, prefilterShadowingObstacles } from '../analysisEngine';

describe('Modifier Scene Facade Point Consistency', () => {
  it('ensures points on stepped/terraced buildings evaluate shadowing § 12 correctly', () => {
    const jsonPath = path.resolve(__dirname, '../../../reference/test-modyfikatorow-3.json');
    const scene = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const { buildings, pinnedPoints, settings, sunlightMethod } = scene;

    const batchOutput = defaultSolarAnalysisEngine.runFullAnalysis(
      buildings,
      settings,
      { samplingInterval: 0.25, angleStepDeg: 0.5, sunlightStepMinutes: 5, shadowStepHours: 0.25 },
      sunlightMethod,
      { shadowing: true, sunlight: true, shadowRange: false }
    );

    // Verify all pinned points in test-modyfikatorow-3.json
    for (const pinned of pinnedPoints) {
      const bldg = buildings.find((b: any) => b.id === pinned.buildingId);
      expect(bldg).toBeDefined();
      const seg = bldg.segments.find((s: any) => s.id === pinned.segmentId);
      expect(seg).toBeDefined();

      const r = pinned.offsetRatio;
      const exactPoint = {
        x: seg.p1.x + r * (seg.p2.x - seg.p1.x),
        y: seg.p1.y + r * (seg.p2.y - seg.p1.y),
      };

      const prefilteredShadowing = prefilterShadowingObstacles(exactPoint, seg, buildings, bldg.id);
      const pointShadowRes = analyzeShadowingAtPoint(
        exactPoint,
        seg,
        r,
        buildings,
        bldg.id,
        0.5,
        prefilteredShadowing
      );

      // P1 (story 1) has no foreign obstacle in front of it -> 156.0° free span, compliant
      if (pinned.label === 'P1') {
        expect(pointShadowRes.isCompliant).toBe(true);
        expect(pointShadowRes.maxContinuousFreeSpanDeg).toBe(156.0);
      }

      // Batch results on the same segment should also not be 0.0°
      const batchPtsOnSeg = batchOutput.results.filter((p: any) => p.segmentId === seg.id);
      expect(batchPtsOnSeg.length).toBeGreaterThan(0);
      for (const pt of batchPtsOnSeg) {
        expect(pt.shadowing.isCompliant).toBe(true);
        expect(pt.shadowing.maxContinuousFreeSpanDeg).toBe(156.0);
      }
    }
  });
});
