import { describe, it, expect } from 'vitest';
import { runFullAnalysis } from './analysisEngine';
import { BuildingLoop, ProjectSettings, FacadeSegment } from '../types/geometry';

function createSegment(
  id: string,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  hTop: number,
  normal: { x: number; y: number }
): FacadeSegment {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return {
    id,
    p1,
    p2,
    hTop,
    normal,
    length: Math.hypot(dx, dy),
    angleRad: Math.atan2(dy, dx),
    hWindowBottom: 0.85,
    isCityCentre: false,
    buildingType: 'residential',
  };
}

function createSyntheticScene(numBuildings: number): BuildingLoop[] {
  const buildings: BuildingLoop[] = [];

  // Building 0 is tested
  buildings.push({
    id: 'tested-0',
    name: 'Budynek Badany',
    vertices: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 15 },
      { x: 0, y: 15 },
    ],
    segments: [
      createSegment('s0-1', { x: 0, y: 0 }, { x: 20, y: 0 }, 12, { x: 0, y: -1 }),
      createSegment('s0-2', { x: 20, y: 0 }, { x: 20, y: 15 }, 12, { x: 1, y: 0 }),
      createSegment('s0-3', { x: 20, y: 15 }, { x: 0, y: 15 }, 12, { x: 0, y: 1 }),
      createSegment('s0-4', { x: 0, y: 15 }, { x: 0, y: 0 }, 12, { x: -1, y: 0 }),
    ],
    defaultHeight: 12,
    hWindowBottom: 0.85,
    isTested: true,
    isIncluded: true,
    isCityCentre: false,
    buildingType: 'residential',
    isClockwise: false,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    layer: 'Domyślna (0)',
  });

  // Surrounding obstacles
  for (let i = 1; i <= numBuildings; i++) {
    const col = (i % 8) - 4;
    const row = Math.floor(i / 8) - 2;
    if (col === 0 && row === 0) continue;

    const bx = col * 35 + 10;
    const by = row * 35 + 10;
    const h = 15 + (i % 10);

    buildings.push({
      id: `bldg-${i}`,
      name: `Przeszkoda ${i}`,
      vertices: [
        { x: bx, y: by },
        { x: bx + 18, y: by },
        { x: bx + 18, y: by + 18 },
        { x: bx, y: by + 18 },
      ],
      segments: [
        createSegment(`s${i}-1`, { x: bx, y: by }, { x: bx + 18, y: by }, h, { x: 0, y: -1 }),
        createSegment(`s${i}-2`, { x: bx + 18, y: by }, { x: bx + 18, y: by + 18 }, h, { x: 1, y: 0 }),
        createSegment(`s${i}-3`, { x: bx + 18, y: by + 18 }, { x: bx, y: by + 18 }, h, { x: 0, y: 1 }),
        createSegment(`s${i}-4`, { x: bx, y: by + 18 }, { x: bx, y: by }, h, { x: -1, y: 0 }),
      ],
      defaultHeight: h,
      hWindowBottom: 0.85,
      isTested: false,
      isIncluded: true,
      isCityCentre: false,
      buildingType: 'residential',
      isClockwise: false,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
      layer: 'Bariery',
    });
  }

  return buildings;
}

describe('Performance Benchmark for runFullAnalysis', () => {
  const settings: ProjectSettings = {
    latitude: 52.23,
    longitude: 21.01,
    isCityCentreDefault: false,
    samplingInterval: 0.5,
    equinoxDate: 'spring',
  };

  it('runs fast on a dense 40-building scene', () => {
    const scene = createSyntheticScene(40);
    const t0 = performance.now();
    const result = runFullAnalysis(scene, settings, { samplingInterval: 0.5 });
    const elapsed = performance.now() - t0;

    console.log(`[Benchmark] Dense 40-building analysis completed in ${elapsed.toFixed(2)} ms. Sampled points: ${result.totalPoints}`);
    expect(result.results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1500); // Must comfortably finish under 1.5s
  });

  it('runs Linijka Slonca segment method at ultra-fast speeds using LUT and Cross Product', () => {
    const scene = createSyntheticScene(40);
    const t0 = performance.now();
    const result = runFullAnalysis(scene, settings, { samplingInterval: 0.5 }, 'segments');
    const elapsed = performance.now() - t0;

    console.log(`[Benchmark] Linijka Slonca 40-building analysis completed in ${elapsed.toFixed(2)} ms. Sampled points: ${result.totalPoints}`);
    expect(result.results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1500);
  });
});
