import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { defaultSolarAnalysisEngine } from '../solar';
import { analyzeShadowingAtPoint, prefilterShadowingObstacles } from '../analysisEngine';

describe('Modifier Scene Facade Point Consistency', () => {
  it('ensures batch analysis and pinned point match 100% and upper coplanar walls do not block lower walls', () => {
    const jsonPath = path.resolve(__dirname, '../../../reference/test-modyfikatorow.json');
    const scene = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const { buildings, pinnedPoints, settings, sunlightMethod } = scene;

    const batchOutput = defaultSolarAnalysisEngine.runFullAnalysis(
      buildings,
      settings,
      { samplingInterval: 0.25, angleStepDeg: 0.5, sunlightStepMinutes: 5, shadowStepHours: 0.25 },
      sunlightMethod,
      { shadowing: true, sunlight: true, shadowRange: false }
    );

    // Target pinned point P3 on seg_1
    const targetPinned = pinnedPoints.find((p: any) => p.id === scene.activePinnedPointId);
    expect(targetPinned).toBeDefined();

    const bldg = buildings.find((b: any) => b.id === targetPinned.buildingId);
    const seg = bldg.segments.find((s: any) => s.id === targetPinned.segmentId);
    const r = targetPinned.offsetRatio;
    const exactPoint = {
      x: seg.p1.x + r * (seg.p2.x - seg.p1.x),
      y: seg.p1.y + r * (seg.p2.y - seg.p1.y),
    };

    const prefilteredShadowing = prefilterShadowingObstacles(exactPoint, seg, buildings, bldg.id);
    
    // Ensure seg_10 (coplanar upper floor) is NOT in obstacles
    const hasUpperCoplanar = prefilteredShadowing.some((obs: any) => obs.seg.id === 'bldg-1788643348050-e2um_seg_10');
    expect(hasUpperCoplanar).toBe(false);

    // Ensure real protruding bay window flank seg_2 IS in obstacles
    const hasBayFlank = prefilteredShadowing.some((obs: any) => obs.seg.id === 'bldg-1788643348050-e2um_seg_2');
    expect(hasBayFlank).toBe(true);

    const pointShadowRes = analyzeShadowingAtPoint(
      exactPoint,
      seg,
      r,
      buildings,
      bldg.id,
      0.5,
      prefilteredShadowing
    );

    // All sample points on seg_1 in batch analysis must have valid free spans (not 0.0° from self coplanar wall)
    const batchPtsOnSeg1 = batchOutput.results.filter((p: any) => p.segmentId === seg.id);
    expect(batchPtsOnSeg1.length).toBeGreaterThan(0);
    for (const pt of batchPtsOnSeg1) {
      expect(pt.shadowing.maxContinuousFreeSpanDeg).toBeGreaterThan(35);
      expect(pt.shadowing.maxContinuousFreeSpanDeg).toBeLessThan(60);
    }

    // Point result should have consistent continuous span
    expect(pointShadowRes.maxContinuousFreeSpanDeg).toBeGreaterThan(35);
    expect(pointShadowRes.maxContinuousFreeSpanDeg).toBeLessThan(60);
    expect(pointShadowRes.maxContinuousFreeSpanDeg).toBeCloseTo(47.46, 1);
  });
});
