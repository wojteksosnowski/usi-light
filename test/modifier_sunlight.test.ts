import { describe, it, expect } from 'vitest';
import { createBuildingFromVertices } from '../src/utils/dxfParser';
import { applyBuildingModifiers } from '../src/engine/modifiers/modifierPipeline';
import { analyzeSunlightAtPointSegments, analyzeShadowingAtPoint } from '../src/engine/analysisEngine';
import { ProjectSettings } from '../src/types/geometry';

describe('Story Offset Modifier Sunlight § 56 & Shadowing § 12 Validation', () => {
  const settings: ProjectSettings = {
    latitude: 52.2297, // Warszawa
    longitude: 21.0122,
    equinoxDate: 'spring',
    defaultBuildingHeight: 15,
    firstFloorHeight: 3.5,
    typicalFloorHeight: 3.0,
    storeysCount: 5,
    minDistanceToBoundary: 4,
    requiredSunlightHoursResidential: 3.0,
    requiredSunlightHoursChildcare: 3.0,
    isCityCentre: false,
    accuracy: {
      shadowingSampleStepMeters: 1.0,
      sunlightSampleStepMeters: 1.0,
      angleStepDeg: 0.5,
      sunlightStepMinutes: 5,
    },
  };

  // Budynek 10x10 o wysokości 15m z 5 kondygnacjami: [0..3.5], [3.5..6.5], [6.5..9.5], [9.5..12.5], [12.5..15.0]
  const rawBuilding = createBuildingFromVertices(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    'Budynek Penthouse',
    15.0,
    true
  );
  rawBuilding.storeysCount = 5;
  rawBuilding.firstFloorHeight = 3.5;
  rawBuilding.typicalFloorHeight = 3.0;

  it('bada stan segmentów i nasłonecznienia dla cofniętej ostatniej kondygnacji (penthouse)', () => {
    const bldgWithMod = {
      ...rawBuilding,
      modifiers: [
        {
          id: 'mod-penthouse',
          type: 'story_offset' as const,
          enabled: true,
          distance: -2.0, // 2m cofnięcia
          storiesCount: -1, // 1 ostatnia kondygnacja (piętro 4: [12.5..15.0m])
        },
      ],
    };

    const modResult = applyBuildingModifiers(bldgWithMod);
    const fullBldg = {
      ...bldgWithMod,
      storyPolygons: modResult.storyPolygons,
      segments: modResult.segments,
    };

    console.log('Wygenerowane segmenty:');
    for (const s of fullBldg.segments) {
      console.log(`Seg ${s.id}: p1=(${s.p1.x},${s.p1.y}) p2=(${s.p2.x},${s.p2.y}) hBase=${s.hBase} hTop=${s.hTop} norm=(${s.normal.x.toFixed(2)},${s.normal.y.toFixed(2)})`);
    }

    // Szukamy ściany południowej dolnej (y = 0) oraz cofniętej ściany południowej (y = 2)
    const baseSouthSeg = fullBldg.segments.find((s) => Math.abs(s.p1.y) < 0.1 && Math.abs(s.p2.y) < 0.1 && s.normal.y < -0.9);
    const pentSouthSeg = fullBldg.segments.find((s) => Math.abs(s.p1.y - 2) < 0.1 && Math.abs(s.p2.y - 2) < 0.1 && s.normal.y < -0.9);

    expect(baseSouthSeg).toBeDefined();
    expect(pentSouthSeg).toBeDefined();

    expect(baseSouthSeg!.hBase).toBe(0);
    expect(baseSouthSeg!.hTop).toBe(12.5);

    expect(pentSouthSeg!.hBase).toBe(12.5);
    expect(pentSouthSeg!.hTop).toBe(15.0);

    // Badamy punkt na cofniętej fasadzie południowej (np. x=5, y=2)
    const samplePoint = { x: 5, y: 2 };
    const sunRes = analyzeSunlightAtPointSegments(
      samplePoint,
      pentSouthSeg!,
      0.5,
      [fullBldg],
      fullBldg.id,
      settings
    );

    console.log('Penthouse south sunlight result:', sunRes.totalHours, 'h, isCompliant:', sunRes.isCompliant);

    const shadowRes = analyzeShadowingAtPoint(
      samplePoint,
      pentSouthSeg!,
      0.5,
      [fullBldg],
      fullBldg.id
    );

    console.log('Penthouse south shadowing result:', shadowRes.totalFreeSpanDeg, 'deg, isCompliant:', shadowRes.isCompliant);

    // Południowa fasada penthouse'u w pustej przestrzeni (brak zewnętrznych przeszkód)
    // musi mieć pełne nasłonecznienie (>4.5h) i nie może być blokowana przez samą siebie / dolne kondygnacje
    expect(sunRes.totalHours).toBeGreaterThan(4.5);
    expect(sunRes.isCompliant).toBe(true);
    expect(shadowRes.isCompliant).toBe(true);
  });
});
