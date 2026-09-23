import { describe, it, expect } from 'vitest';
import { GeometryCompiler } from './GeometryCompiler';
import { BuildingLoop, Point2D } from '@/types/geometry';

describe('GeometryCompiler - Edge Cases & Robustness Suite', () => {
  it('E1: Degenerate polygon (less than 3 vertices) returns safe empty structures', () => {
    const lineBldg: BuildingLoop = {
      id: 'b_line',
      name: 'Line Building',
      category: 'building',
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      defaultHeight: 10,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential',
      layer: '0',
      isTested: true,
      segments: [],
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const compiled = GeometryCompiler.bakeBuilding(lineBldg);
    expect(compiled.metrics.footprintArea).toBe(0);
    expect(compiled.metrics.volume).toBe(0);
    expect(compiled.representation3D.faces.length).toBe(0);
  });

  it('E2: Zero height building produces 0 volume and flat bounds', () => {
    const flatBldg: BuildingLoop = {
      id: 'b_flat',
      name: 'Flat Building',
      category: 'building',
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      defaultHeight: 0,
      elevation: 5,
      hWindowBottom: 0.85,
      isCityCentre: false,
      buildingType: 'residential',
      layer: '0',
      isTested: true,
      segments: [],
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const compiled = GeometryCompiler.bakeBuilding(flatBldg);
    expect(compiled.metrics.footprintArea).toBeCloseTo(100, 4);
    expect(compiled.metrics.volume).toBe(0);
    expect(compiled.representation3D.faces.length).toBe(0);
  });
});
