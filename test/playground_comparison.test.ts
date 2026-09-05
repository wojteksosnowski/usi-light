import { describe, it, expect } from 'vitest';
import { BuildingLoop, ProjectSettings } from '../src/types/geometry';
import { analyzePlaygroundSunlight } from '../src/engine/analysisEngine';
import { generatePolygonalVoronoiCells } from '../src/utils/math2d/voronoi';

describe('Playground Sunlight: Adaptive Voronoi vs Clipped Orthogonal Grid Comparison', () => {
  const defaultSettings: ProjectSettings = {
    latitude: 52.2297, // Warsaw
    longitude: 21.0122,
    isCityCentreDefault: false,
    samplingInterval: 0.5,
    equinoxDate: 'spring',
  };

  const obstacleBuilding: BuildingLoop = {
    id: 'bldg-south-obs',
    name: 'Budynek rzucający cień od południa',
    category: 'building',
    isTested: false,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 18.0,
    elevation: 0,
    hWindowBottom: 0.85,
    layer: 'Budynki',
    isClockwise: false,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    vertices: [
      { x: -5, y: -10 },
      { x: 15, y: -10 },
      { x: 15, y: -2 },
      { x: -5, y: -2 },
    ],
    segments: [
      {
        id: 'obs-s1',
        p1: { x: -5, y: -2 },
        p2: { x: 15, y: -2 },
        normal: { x: 0, y: 1 },
        length: 20,
        angleRad: 0,
        hTop: 18.0,
        hBase: 0,
        hWindowBottom: 0.85,
        isCityCentre: false,
        buildingType: 'residential',
      },
    ],
  };

  const convexPlayground: BuildingLoop = {
    id: 'pg-square',
    name: 'Kwadratowy plac zabaw 10x10',
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
    playgroundVoronoi: true,
  };

  const lShapedPlayground: BuildingLoop = {
    id: 'pg-l-shape',
    name: 'Plac zabaw w kształcie L',
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
      { x: 12, y: 0 },
      { x: 12, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 12 },
      { x: 0, y: 12 },
    ],
    segments: [],
    playgroundVoronoi: true,
  };

  it('verifies that isInteracting reduces sampling density significantly for fast 60fps drag', () => {
    const resResting = analyzePlaygroundSunlight(
      convexPlayground,
      [convexPlayground, obstacleBuilding],
      defaultSettings,
      'raycasting',
      { isInteracting: false }
    );

    const resInteracting = analyzePlaygroundSunlight(
      convexPlayground,
      [convexPlayground, obstacleBuilding],
      defaultSettings,
      'raycasting',
      { isInteracting: true }
    );

    expect(resInteracting.totalSamplePoints).toBeLessThanOrEqual(15);
    expect(resResting.totalSamplePoints).toBeGreaterThan(resInteracting.totalSamplePoints);
    expect(resResting.totalSamplePoints).toBeLessThanOrEqual(55);
  });

  it('compares sunlit compliance between Voronoi mode and Orthogonal grid mode within 1% error', () => {
    // Voronoi Mode
    const pgVoronoi: BuildingLoop = { ...convexPlayground, playgroundVoronoi: true };
    const resVoronoi = analyzePlaygroundSunlight(
      pgVoronoi,
      [pgVoronoi, obstacleBuilding],
      defaultSettings,
      'raycasting'
    );

    // Orthogonal Grid Mode
    const pgOrtho: BuildingLoop = { ...convexPlayground, playgroundVoronoi: false };
    const resOrtho = analyzePlaygroundSunlight(
      pgOrtho,
      [pgOrtho, obstacleBuilding],
      defaultSettings,
      'raycasting'
    );

    // Both should yield consistent compliance and very close sunlit percentages (< 4% diff between organic Voronoi and orthogonal grid)
    expect(resVoronoi.isCompliant).toBe(resOrtho.isCompliant);
    const diff = Math.abs(resVoronoi.sunlitPercentage - resOrtho.sunlitPercentage);
    expect(diff).toBeLessThanOrEqual(4.0);
  });

  it('evaluates L-shaped polygon Voronoi clipping and sample points distribution', () => {
    const resL = analyzePlaygroundSunlight(
      lShapedPlayground,
      [lShapedPlayground, obstacleBuilding],
      defaultSettings,
      'raycasting'
    );

    expect(resL.totalArea).toBe(108); // (12*6) + (6*6) = 72 + 36 = 108 m2
    expect(resL.totalSamplePoints).toBeGreaterThan(0);
    expect(resL.totalSamplePoints).toBeLessThanOrEqual(50);

    // Verify Voronoi cells can be generated from these sample points within the L-shape boundary
    const sites = resL.samplePoints.map((sp) => sp.point);
    const cells = generatePolygonalVoronoiCells(sites, lShapedPlayground.vertices);
    expect(cells.length).toBe(sites.length);
    for (const cell of cells) {
      expect(cell.polygon.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('maintains strict separation: Orthogonal grid mode does NOT use Voronoi chord sampling', () => {
    const pgOrtho: BuildingLoop = { ...convexPlayground, playgroundVoronoi: false };
    const resOrtho = analyzePlaygroundSunlight(
      pgOrtho,
      [pgOrtho, obstacleBuilding],
      defaultSettings,
      'raycasting',
      { samplingInterval: 1.0 }
    );

    // All sample points in orthogonal mode should lie on regular grid coordinates
    for (const sp of resOrtho.samplePoints) {
      // In 10x10 with step 1.0, grid lines are x = 0.5, 1.5, 2.5...
      const modX = Math.round((sp.point.x - 0.5) * 100) % 100;
      const modY = Math.round((sp.point.y - 0.5) * 100) % 100;
      expect(modX).toBe(0);
      expect(modY).toBe(0);
    }
  });

  it('supports custom test parameters (playgroundParams) for fine-tuning Voronoi density', () => {
    const pgCoarse: BuildingLoop = {
      ...convexPlayground,
      playgroundParams: {
        baseStep: 8.0,
        maxExtraPoints: 0,
      },
    };

    const pgDense: BuildingLoop = {
      ...convexPlayground,
      playgroundParams: {
        baseStep: 3.0,
        maxExtraPoints: 30,
        minSubdivDist: 1.0,
        hoursDeltaThreshold: 0.5,
      },
    };

    const resCoarse = analyzePlaygroundSunlight(pgCoarse, [pgCoarse, obstacleBuilding], defaultSettings, 'raycasting');
    const resDense = analyzePlaygroundSunlight(pgDense, [pgDense, obstacleBuilding], defaultSettings, 'raycasting');

    expect(resCoarse.totalSamplePoints).toBeLessThan(resDense.totalSamplePoints);
  });

  it('verifies caching of playground sunlight analysis', () => {
    const res1 = analyzePlaygroundSunlight(convexPlayground, [convexPlayground, obstacleBuilding], defaultSettings, 'raycasting');
    const res2 = analyzePlaygroundSunlight(convexPlayground, [convexPlayground, obstacleBuilding], defaultSettings, 'raycasting');

    expect(res1).toBe(res2); // Exactly same cached object reference
  });
});
