import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  prefilterSunlightObstacles,
  prefilterShadowingObstacles,
  analyzeSunlightAtPointSegments,
  analyzeSunlightAtPoint,
} from '../src/engine/analysisEngine';

describe('Naprawa prefiltra nasłonecznienia - Punkt P1 (error-linijka.json)', () => {
  it('nie odrzuca budynku bldg-51 i poprawnie wylicza 80 minut (1.33h) nasłonecznienia w punkcie P1', () => {
    const filePath = path.resolve(__dirname, '../reference/error-linijka.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const pinned = data.pinnedPoints[0];
    expect(pinned.label).toBe('P1');

    const bldg = data.buildings.find((b: any) => b.id === pinned.buildingId);
    const seg = bldg.segments.find((s: any) => s.id === pinned.segmentId);
    const pt = {
      x: seg.p1.x + pinned.offsetRatio * (seg.p2.x - seg.p1.x),
      y: seg.p1.y + pinned.offsetRatio * (seg.p2.y - seg.p1.y),
    };

    // 1. Prefiltr nasłonecznienia (§ 56)
    const sunlightObstacles = prefilterSunlightObstacles(pt, seg, data.buildings, bldg.id);
    
    // Budynek 51 (bldg-51) znajduje się w odległości ~55-75m i rzuca cień rano.
    // Musi być uwzględniony w prefiltrze nasłonecznienia:
    const bldg51Included = sunlightObstacles.some((o) => o.bldgId === 'bldg-51');
    expect(bldg51Included).toBe(true);

    // 2. Prefiltr przesłaniania (§ 12) - zachowuje regułę 35m i nie uwzględnia bldg-51
    const shadowingObstacles = prefilterShadowingObstacles(pt, seg, data.buildings, bldg.id);
    const bldg51InShadowing = shadowingObstacles.some((o) => o.bldgId === 'bldg-51');
    expect(bldg51InShadowing).toBe(false);

    // 3. Obliczenie nasłonecznienia Metodą Linijki Słońca
    const resSegments = analyzeSunlightAtPointSegments(
      pt,
      seg,
      pinned.offsetRatio,
      data.buildings,
      bldg.id,
      data.settings,
      sunlightObstacles
    );

    // Dokładnie 80 minut (1h 20 min)
    expect(resSegments.totalMinutes).toBe(80);
    expect(resSegments.totalHours).toBeCloseTo(1.333, 2);

    // 4. Obliczenie referencyjną Metodą Astronomiczną
    const resAstro = analyzeSunlightAtPoint(
      pt,
      seg,
      pinned.offsetRatio,
      data.buildings,
      bldg.id,
      data.settings,
      5,
      undefined,
      sunlightObstacles
    );

    expect(resAstro.totalMinutes).toBe(80);
    expect(resAstro.totalHours).toBeCloseTo(1.333, 2);
  });
});
