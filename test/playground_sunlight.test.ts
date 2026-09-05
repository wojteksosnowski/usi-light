import { describe, it, expect } from 'vitest';
import { BuildingLoop, ProjectSettings } from '../src/types/geometry';
import { analyzePlaygroundSunlight } from '../src/engine/analysisEngine';
import { computePlaygroundApartmentCapacity } from '../src/utils/playgroundUtils';

describe('Playground Sunlight Analysis (§ 33 ust. 3 WT)', () => {
  const defaultSettings: ProjectSettings = {
    latitude: 52.2297, // Warsaw
    longitude: 21.0122,
    isCityCentreDefault: false,
    samplingInterval: 0.25,
    equinoxDate: 'spring',
  };

  const playground: BuildingLoop = {
    id: 'pg-1',
    name: 'Plac zabaw dla dzieci',
    category: 'boundary',
    areaType: 'playground',
    isTested: true,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'other',
    defaultHeight: 0,
    elevation: 0,
    hWindowBottom: 0,
    layer: 'Place zabaw',
    isClockwise: false,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    segments: [],
  };

  it('calculates full sunlight (100% compliance) for open playground without obstacles in Astro mode', () => {
    const result = analyzePlaygroundSunlight(playground, [playground], defaultSettings, 'raycasting');
    expect(result.totalArea).toBe(100);
    expect(result.totalSamplePoints).toBeGreaterThan(0);
    expect(result.compliantSamplePoints).toBe(result.totalSamplePoints);
    expect(result.sunlitPercentage).toBe(100.0);
    expect(result.requiredDurationHours).toBe(2.0);
    expect(result.isCompliant).toBe(true);
  });

  it('calculates full sunlight (100% compliance) for open playground without obstacles in Linijka Słońca mode', () => {
    const result = analyzePlaygroundSunlight(playground, [playground], defaultSettings, 'segments');
    expect(result.totalArea).toBe(100);
    expect(result.totalSamplePoints).toBeGreaterThan(0);
    expect(result.compliantSamplePoints).toBe(result.totalSamplePoints);
    expect(result.sunlitPercentage).toBe(100.0);
    expect(result.requiredDurationHours).toBe(2.0);
    expect(result.isCompliant).toBe(true);
  });

  it('handles 1.0h requirement for playground located in city centre (zabudowa śródmiejska)', () => {
    const cityPlayground: BuildingLoop = {
      ...playground,
      isCityCentre: true,
    };
    const result = analyzePlaygroundSunlight(cityPlayground, [cityPlayground], defaultSettings, 'raycasting');
    expect(result.requiredDurationHours).toBe(1.0);
    expect(result.isCompliant).toBe(true);
  });

  it('detects failure when tall South obstacle blocks more than 50% of the playground', () => {
    // Tall 40m building standing directly South of playground (y = -5 to y = -1, x = -10 to x = 20)
    const tallSouthObstacle: BuildingLoop = {
      id: 'bldg-south',
      name: 'Wysoki budynek południowy',
      category: 'building',
      isTested: false,
      isIncluded: true,
      isCityCentre: false,
      buildingType: 'residential',
      defaultHeight: 40.0,
      elevation: 0,
      hWindowBottom: 0.85,
      layer: 'Budynki',
      isClockwise: false,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
      vertices: [
        { x: -10, y: -5 },
        { x: 20, y: -5 },
        { x: 20, y: -1 },
        { x: -10, y: -1 },
      ],
      segments: [
        {
          id: 'bldg-south-seg-1',
          p1: { x: -10, y: -1 },
          p2: { x: 20, y: -1 },
          normal: { x: 0, y: 1 },
          length: 30,
          angleRad: 0,
          hTop: 40.0,
          hBase: 0,
          hWindowBottom: 0.85,
          isCityCentre: false,
          buildingType: 'residential',
        },
      ],
    };

    const result = analyzePlaygroundSunlight(playground, [playground, tallSouthObstacle], defaultSettings, 'raycasting');
    expect(result.sunlitPercentage).toBeLessThan(50.0);
    expect(result.isCompliant).toBe(false);
  });

  it('samples playground area with customizable sampling interval and adaptive grid', () => {
    const result = analyzePlaygroundSunlight(playground, [playground], defaultSettings, 'raycasting', { samplingInterval: 1.0 });
    // For 10x10 square with base sampling:
    expect(result.totalSamplePoints).toBeGreaterThanOrEqual(20);
    expect(result.sunlitPercentage).toBe(100.0);
    expect(result.isCompliant).toBe(true);
  });

  it('calibrates adaptive hierarchical grid against reference fine orthogonal grid within 1% error', () => {
    // 1. Plac z przeszkodą rzucającą cień na część terenu
    const obstacle: BuildingLoop = {
      id: 'obs-mid',
      name: 'Przeszkoda Środkowa',
      defaultHeight: 15.0,
      elevation: 0,
      hWindowBottom: 0.85,
      layer: 'Bariery',
      isTested: false,
      isIncluded: true,
      isCityCentre: false,
      buildingType: 'residential',
      isClockwise: false,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
      vertices: [
        { x: -5, y: -8 },
        { x: 15, y: -8 },
        { x: 15, y: -2 },
        { x: -5, y: -2 },
      ],
      segments: [
        {
          id: 'obs-seg-1',
          p1: { x: -5, y: -2 },
          p2: { x: 15, y: -2 },
          normal: { x: 0, y: 1 },
          length: 20,
          angleRad: 0,
          hTop: 15.0,
          hBase: 0,
          hWindowBottom: 0.85,
          isCityCentre: false,
          buildingType: 'residential',
        },
      ],
    };

    const resAdaptive = analyzePlaygroundSunlight(playground, [playground, obstacle], defaultSettings, 'raycasting', { samplingInterval: 1.0 });
    const resDense = analyzePlaygroundSunlight(playground, [playground, obstacle], defaultSettings, 'raycasting', { samplingInterval: 0.25 });

    // Sprawdzamy czy wynik nasłonecznienia procentowego jest zgodny w marginesie błędu (np. <= 1.0%)
    const pctDiff = Math.abs(resAdaptive.sunlitPercentage - resDense.sunlitPercentage);
    expect(pctDiff).toBeLessThanOrEqual(1.0);
    expect(resAdaptive.isCompliant).toBe(resDense.isCompliant);
  });
});

describe('Playground Apartment Capacity Calculator (§ 33 ust. 8 WT)', () => {
  it('handles small investments under 21 apartments (< 21 m2)', () => {
    const cap15 = computePlaygroundApartmentCapacity(15);
    expect(cap15.isUnlimited).toBe(false);
    expect(cap15.maxApartments).toBe(15);
    expect(cap15.displayText).toContain('do 15 mieszkań');
  });

  it('handles 21-50 apartments range (1 m2 per apartment)', () => {
    const cap35 = computePlaygroundApartmentCapacity(35);
    expect(cap35.isUnlimited).toBe(false);
    expect(cap35.maxApartments).toBe(35);
    expect(cap35.displayText).toBe('do 35 mieszkań');
    expect(cap35.tierDescription).toContain('21–50');
  });

  it('handles 51-100 apartments range (fixed 50 m2)', () => {
    const cap50 = computePlaygroundApartmentCapacity(50);
    expect(cap50.isUnlimited).toBe(false);
    expect(cap50.maxApartments).toBe(100);
    expect(cap50.displayText).toBe('do 100 mieszkań');
  });

  it('handles 101-300 apartments range (0.5 m2 per apartment)', () => {
    const cap80 = computePlaygroundApartmentCapacity(80);
    expect(cap80.isUnlimited).toBe(false);
    expect(cap80.maxApartments).toBe(160); // 80 / 0.5 = 160
    expect(cap80.displayText).toBe('do 160 mieszkań');

    const cap160 = computePlaygroundApartmentCapacity(160);
    expect(cap160.maxApartments).toBe(300);
    expect(cap160.displayText).toBe('do 300 mieszkań');
  });

  it('handles > 300 apartments with unlimited capacity for area >= 200 m2', () => {
    const cap220 = computePlaygroundApartmentCapacity(220);
    expect(cap220.isUnlimited).toBe(true);
    expect(cap220.maxApartments).toBeNull();
    expect(cap220.displayText).toBe('> 300 mieszkań (bez limitu)');
  });
});
