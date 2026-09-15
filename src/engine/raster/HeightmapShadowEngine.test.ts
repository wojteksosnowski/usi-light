import { describe, it, expect } from 'vitest';
import { HeightmapShadowEngine } from './HeightmapShadowEngine';
import { BuildingLoop } from '../../types/geometry';

describe('HeightmapShadowEngine', () => {
  const dummyBuildings: BuildingLoop[] = [
    {
      id: 'b1',
      name: 'Przeszkoda A',
      layer: 'Projektowane',
      isTested: false,
      isCityCentre: false,
      buildingType: 'residential',
      defaultHeight: 20.0,
      elevation: 0.0,
      hWindowBottom: 0.85,
      vertices: [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 30 },
        { x: 10, y: 30 },
      ],
      segments: [],
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    },
  ];

  it('rasterizes building height into heightmap grid', () => {
    const engine = new HeightmapShadowEngine(dummyBuildings, { resolution: 1.0, margin: 10 });

    // Wewnątrz budynku (20, 20) wysokość powinna wynosić 20m
    expect(engine.getHeightAt(20, 20)).toBeCloseTo(20.0, 1);

    // Poza budynkiem (0, 0) wysokość powinna wynosić 0m
    expect(engine.getHeightAt(0, 0)).toBe(0);
  });

  it('detects shadow when ray to sun is blocked by obstacle', () => {
    const engine = new HeightmapShadowEngine(dummyBuildings, { resolution: 1.0, margin: 10 });

    // Punkt na ziemi (0, 20, z=0), słońce od wschodu (azymut 90 deg), niska elewacja 15 deg
    // Promień w stronę słońca (+X) przejdzie przez budynek na x ∈ [10, 30] o wysokości 20m
    const inShadow = engine.isPointInShadow(0, 20, 0, 90, 15);
    expect(inShadow).toBe(true);

    // Gdy słońce jest bardzo wysoko (np. 80 deg), promień nad budynkiem na odległości 10m ma wysokość 10 * tan(80°) ≈ 56.7m > 20m
    const inHighSun = engine.isPointInShadow(0, 20, 0, 90, 80);
    expect(inHighSun).toBe(false);

    // Słońce z przeciwnej strony (azymut 270 deg, na zachód) - brak cienia
    const inOppositeSun = engine.isPointInShadow(0, 20, 0, 270, 30);
    expect(inOppositeSun).toBe(false);
  });
});
