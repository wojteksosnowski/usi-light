import { describe, it, expect } from 'vitest';
import { createBuildingFromVertices } from '../src/utils/dxfParser';
import { analyzeSunlightAtPointSegments } from '../src/engine/analysisEngine';
import { ProjectSettings } from '../src/types/geometry';

describe('Hbase & Backface Culling Validation Gate', () => {
  const settings: ProjectSettings = {
    latitude: 52.2297, // Warszawa
    longitude: 21.0122,
    equinoxDate: 'spring',
    defaultBuildingHeight: 15,
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

  // 1. Scena referencyjna: budynek badany na północy, budynek przeszkody na południu
  const testedBuilding = createBuildingFromVertices(
    [
      { x: 0, y: 30 },
      { x: 10, y: 30 },
      { x: 10, y: 40 },
      { x: 0, y: 40 },
    ],
    'Badany',
    15,
    true
  );

  // Fasada południowa budynku badanego (y = 30)
  const southTestedSeg = testedBuilding.segments.find((s) => s.normal.y < -0.9)!;
  const samplePoint = { x: 5, y: 30 };

  it('zapisuje i bada referencyjne nasłonecznienie dla przeszkody o standardowym posadowieniu (Hbase = 0)', () => {
    // Przeszkoda o wysokości 12m na południe od punktu P (y = 10 do 20)
    const obstacleBuilding = createBuildingFromVertices(
      [
        { x: -5, y: 10 },
        { x: 15, y: 10 },
        { x: 15, y: 20 },
        { x: -5, y: 20 },
      ],
      'Przeszkoda Standard',
      12,
      false
    );

    const allBuildings = [testedBuilding, obstacleBuilding];
    const res = analyzeSunlightAtPointSegments(
      samplePoint,
      southTestedSeg,
      0.5,
      allBuildings,
      testedBuilding.id,
      settings
    );

    console.log('[BASELINE Hbase=0] Czas nasłonecznienia:', res.totalHours.toFixed(4), 'h, minuty:', res.totalMinutes);
    // Dokładna zgodność z baseline 4.8832h
    expect(res.totalHours).toBeCloseTo(4.8832, 3);
  });

  it('wykazuje zwiększone nasłonecznienie (prześwit) dla uniesionej bryły / podcienia (Hbase > 0)', () => {
    // Przeszkoda o posadowieniu 10m i wysokości 5m (Hbase = 10, Htop = 15)
    const elevatedBuilding = createBuildingFromVertices(
      [
        { x: -5, y: 10 },
        { x: 15, y: 10 },
        { x: 15, y: 20 },
        { x: -5, y: 20 },
      ],
      'Przeszkoda Uniesiona',
      5,
      false
    );
    elevatedBuilding.elevation = 10;
    elevatedBuilding.segments = elevatedBuilding.segments.map((s) => ({
      ...s,
      hBase: 10,
      hTop: 15,
    }));

    const allBuildings = [testedBuilding, elevatedBuilding];
    const res = analyzeSunlightAtPointSegments(
      samplePoint,
      southTestedSeg,
      0.5,
      allBuildings,
      testedBuilding.id,
      settings
    );

    console.log('[ELEVATED Hbase=10] Czas nasłonecznienia:', res.totalHours.toFixed(4), 'h, minuty:', res.totalMinutes);
    // Czas nasłonecznienia przy prześwicie pod bryłą musi być wyższy niż przy pełnym cieniu od poziomu gruntu
    expect(res.totalHours).toBeGreaterThan(4.8832);
  });

  it('sprawdza, że tylne krawędzie uniesionej bryły rzucają cień (usunięty backface culling)', () => {
    // Uniesiona belka / most o grubości 2m zawieszony na wysokości 8m (Hbase = 8, Htop = 10)
    const bridgeBuilding = createBuildingFromVertices(
      [
        { x: -2, y: 15 },
        { x: 12, y: 15 },
        { x: 12, y: 18 },
        { x: -2, y: 18 },
      ],
      'Mostek',
      2,
      false
    );
    bridgeBuilding.elevation = 8;
    bridgeBuilding.segments = bridgeBuilding.segments.map((s) => ({
      ...s,
      hBase: 8,
      hTop: 10,
    }));

    const allBuildings = [testedBuilding, bridgeBuilding];
    const res = analyzeSunlightAtPointSegments(
      samplePoint,
      southTestedSeg,
      0.5,
      allBuildings,
      testedBuilding.id,
      settings
    );

    expect(res.totalHours).toBeDefined();
    expect(res.totalHours).toBeGreaterThan(0);
  });
});
