import { describe, it, expect } from 'vitest';
import { AstroSolarSystem, LinijkaSolarSystem } from '../src/utils/solar';
import { analyzeSunlightAtPointSegments } from '../src/engine/analysisEngine';
import { BuildingLoop, FacadeSegment, ProjectSettings } from '../src/types/geometry';

describe('Sunlight Visualization Improvements', () => {
  const settings: ProjectSettings = {
    latitude: 52.2297,
    longitude: 21.0122,
    equinoxDate: 'spring',
    defaultHeight: 15.0,
    windowBottomOffset: 0.85,
    analysisMethod: 'segments',
    sunlightMethod: 'segments',
    isCityCentre: false,
  };

  it('generates hour lines in step +-1h from solar noon in Astro method', () => {
    const astro = new AstroSolarSystem(52.2297, 21.0122, 'spring');
    const lines = astro.getHourLines(-5, 5, 1);

    expect(lines.length).toBe(11);
    expect(lines[5].offsetHours).toBe(0);
    expect(lines[5].azimuthDeg).toBeCloseTo(180.0, 2);

    for (let i = 0; i < lines.length; i++) {
      const expectedOffset = -5 + i;
      expect(lines[i].offsetHours).toBe(expectedOffset);
      expect(lines[i].hourFraction).toBeCloseTo(astro.solarNoonDecimal + expectedOffset, 4);
    }
  });

  it('assigns requiredDistance on sunlight sectors based on obstacle heights', () => {
    // Badany budynek na południu (Y=0)
    const testedSegment: FacadeSegment = {
      id: 'seg_tested',
      p1: { x: -10, y: 0 },
      p2: { x: 10, y: 0 },
      normal: { x: 0, y: -1 }, // Fasada skierowana na południe (-Y)
      hBase: 0,
      hTop: 15,
      isTested: true,
    };

    const testedBuilding: BuildingLoop = {
      id: 'bldg_tested',
      name: 'Badany',
      category: 'tested',
      isIncluded: true,
      defaultHeight: 15,
      vertices: [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: -10, y: 10 },
      ],
      segments: [testedSegment],
    };

    // Budynek przesłaniający na południe o wysokości 20m (Y=-20)
    const obstacleSegment: FacadeSegment = {
      id: 'seg_obs',
      p1: { x: -5, y: -20 },
      p2: { x: 5, y: -20 },
      normal: { x: 0, y: 1 },
      hBase: 0,
      hTop: 20,
      isTested: false,
    };

    const obstacleBuilding: BuildingLoop = {
      id: 'bldg_obs',
      name: 'Przeszkoda',
      category: 'obstacle',
      isIncluded: true,
      defaultHeight: 20,
      vertices: [
        { x: -5, y: -20 },
        { x: 5, y: -20 },
        { x: 5, y: -30 },
        { x: -5, y: -30 },
      ],
      segments: [obstacleSegment],
    };

    const point = { x: 0, y: 0 };
    const res = analyzeSunlightAtPointSegments(
      point,
      testedSegment,
      0.5,
      [testedBuilding, obstacleBuilding],
      testedBuilding.id,
      settings
    );

    expect(res.sectors).toBeDefined();
    expect(res.sectors!.length).toBeGreaterThan(0);

    // Przeszkoda o H=20m ma Ltotal = 20 * tan(52.2297°) ≈ 25.81m
    const expectedLtotal = 20.0 * Math.tan(52.2297 * Math.PI / 180);
    const freeSector = res.sectors!.find((s) => s.isDirectSunlight);
    expect(freeSector).toBeDefined();
    expect(freeSector?.requiredDistance).toBeCloseTo(expectedLtotal, 1);
  });
});
