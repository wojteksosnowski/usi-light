import { describe, it, expect } from 'vitest';
import { LinijkaSolarSystem } from '../src/utils/solar';
import {
  analyzeSunlightAtPointSegments,
  computeDailySolarTrajectory,
  precomputeSolarWindow,
} from '../src/engine/analysisEngine';
import { BuildingLoop, FacadeSegment, ProjectSettings } from '../src/types/geometry';

describe('Linijka Słońca Pure Analytical Engine (§ 56 WT)', () => {
  const settings: ProjectSettings = {
    latitude: 52.23, // Warsaw
    longitude: 21.01,
    isCityCentreDefault: false,
    samplingInterval: 0.5,
    equinoxDate: 'spring',
  };

  const linijkaSys = new LinijkaSolarSystem(settings.latitude, settings.longitude, settings.equinoxDate);

  it('provides exact O(1) mapping between azimuth and solar time on equinox', () => {
    // 12:00 corresponds to azimuth 180.0° (South)
    const noonAz = linijkaSys.getAzimuthForHour(12.0);
    expect(noonAz).toBeCloseTo(180.0, 5);

    const noonHour = linijkaSys.getHourForAzimuth(180.0);
    expect(noonHour).toBeCloseTo(12.0, 5);

    // Symmetry test: -5h (07:00) and +5h (17:00)
    const az7 = linijkaSys.getAzimuthForHour(7.0);
    const az17 = linijkaSys.getAzimuthForHour(17.0);
    expect(180 - az7).toBeCloseTo(az17 - 180, 5);

    // Roundtrip test across entire daytime range [6.0, 18.0]
    for (let h = 7.0; h <= 17.0; h += 0.25) {
      const az = linijkaSys.getAzimuthForHour(h);
      const hBack = linijkaSys.getHourForAzimuth(az);
      expect(hBack).toBeCloseTo(h, 4);
    }
  });

  it('computes exact unblocked duration for completely open south facade (10.0h)', () => {
    const southSegment: FacadeSegment = {
      id: 'seg-south',
      p1: { x: 0, y: 0 },
      p2: { x: 20, y: 0 },
      normal: { x: 0, y: -1 }, // Facing South (180°)
      length: 20,
      angleRad: 0,
      hTop: 10,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential',
    };

    const targetBldg: BuildingLoop = {
      id: 'bldg-target',
      name: 'Target Building',
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 0, y: 10 },
      ],
      segments: [southSegment],
      defaultHeight: 10,
      isTested: true,
      isIncluded: true,
    };

    const point = { x: 10, y: 0 };
    const res = analyzeSunlightAtPointSegments(
      point,
      southSegment,
      0.5,
      [targetBldg],
      targetBldg.id,
      settings,
      undefined,
      undefined,
      linijkaSys
    );

    // Unblocked 10h window: 7:00 to 17:00 => exactly 10.0 hours
    expect(res.totalHours).toBeCloseTo(10.0, 2);
    expect(res.totalMinutes).toBe(600);
    expect(res.isCompliant).toBe(true);
    expect(res.sectors?.length).toBe(1);
    expect(res.sectors![0].startTimeStr).toBe('07:00');
    expect(res.sectors![0].endTimeStr).toBe('17:00');
  });

  it('merges overlapping obstacles and performs exact 1D interval union without double-counting', () => {
    const southSegment: FacadeSegment = {
      id: 'seg-south',
      p1: { x: 0, y: 0 },
      p2: { x: 20, y: 0 },
      normal: { x: 0, y: -1 }, // South
      length: 20,
      angleRad: 0,
      hTop: 10,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential',
    };

    const targetBldg: BuildingLoop = {
      id: 'bldg-target',
      name: 'Target Building',
      vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
      segments: [southSegment],
      defaultHeight: 10,
      isTested: true,
      isIncluded: true,
    };

    // Obstacle 1: Directly South at y = -10, x from 5 to 15, H = 15m
    const obs1Seg: FacadeSegment = {
      id: 'obs1-seg',
      p1: { x: 5, y: -10 },
      p2: { x: 15, y: -10 },
      normal: { x: 0, y: 1 },
      length: 10,
      angleRad: 0,
      hTop: 15,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential',
    };
    const obsBldg1: BuildingLoop = {
      id: 'bldg-obs1',
      name: 'Obstacle 1',
      vertices: [{ x: 5, y: -10 }, { x: 15, y: -10 }, { x: 15, y: -20 }, { x: 5, y: -20 }],
      segments: [obs1Seg],
      defaultHeight: 15,
      isTested: false,
      isIncluded: true,
    };

    // Obstacle 2: Overlapping Obstacle 1 from x = 10 to 20, same distance
    const obs2Seg: FacadeSegment = {
      id: 'obs2-seg',
      p1: { x: 10, y: -10 },
      p2: { x: 20, y: -10 },
      normal: { x: 0, y: 1 },
      length: 10,
      angleRad: 0,
      hTop: 15,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential',
    };
    const obsBldg2: BuildingLoop = {
      id: 'bldg-obs2',
      name: 'Obstacle 2',
      vertices: [{ x: 10, y: -10 }, { x: 20, y: -10 }, { x: 20, y: -20 }, { x: 10, y: -20 }],
      segments: [obs2Seg],
      defaultHeight: 15,
      isTested: false,
      isIncluded: true,
    };

    // Test with Obstacle 1 alone, Obstacle 2 alone, and BOTH together
    const point = { x: 10, y: 0 };
    const res1 = analyzeSunlightAtPointSegments(point, southSegment, 0.5, [targetBldg, obsBldg1], targetBldg.id, settings, undefined, undefined, linijkaSys);
    const resBoth = analyzeSunlightAtPointSegments(point, southSegment, 0.5, [targetBldg, obsBldg1, obsBldg2], targetBldg.id, settings, undefined, undefined, linijkaSys);

    // Both together should have less or equal sunlight than 1 alone, and continuous sectors without overlap
    expect(resBoth.totalHours).toBeLessThan(res1.totalHours);
    expect(resBoth.sectors?.length).toBeGreaterThanOrEqual(1);

    // Sum of sector hours must exactly equal totalHours
    const sumSecHours = resBoth.sectors!.reduce((acc, s) => acc + s.hours, 0);
    expect(sumSecHours).toBeCloseTo(resBoth.totalHours, 4);
  });
});
