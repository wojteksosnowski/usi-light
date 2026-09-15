import { describe, it, expect } from 'vitest';
import { getBuildingSolids, computeBuildingFrameBounds } from './buildingIsoGeometry';
import type { BuildingLoop } from '@/types/geometry';

function createBuilding(overrides: Partial<BuildingLoop> = {}): BuildingLoop {
  return {
    id: 'b1',
    name: 'Test',
    layer: 'default',
    isTested: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 9,
    hWindowBottom: 0.85,
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    ...overrides,
  };
}

function bounds(polygon: { x: number; y: number }[]) {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

describe('getBuildingSolids', () => {
  it('falls back to a single extrusion from vertices/elevation/defaultHeight when storyPolygons is empty', () => {
    const building = createBuilding({ elevation: 2, defaultHeight: 9 });
    const solids = getBuildingSolids(building);
    expect(solids).toHaveLength(1);
    expect(solids[0]).toMatchObject({ hBottom: 2, hTop: 11, holes: [] });
    expect(bounds(solids[0].polygon)).toEqual(bounds(building.vertices));
    expect(solids[0].polygon).toEqual(building.vertices);
  });

  it('maps multi-storey storyPolygons through, including holes', () => {
    const building = createBuilding({
      storyPolygons: [
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
        {
          storyIndex: 1,
          hBottom: 3,
          hTop: 6,
          polygon: [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 9 }],
          holes: [[{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }]],
        },
      ],
    });
    const solids = getBuildingSolids(building);
    expect(solids).toHaveLength(2);
    expect(solids[0].holes).toEqual([]);
    expect(solids[1].holes).toHaveLength(1);
    expect(solids[1].hBottom).toBe(3);
    expect(solids[1].hTop).toBe(6);
  });

  it('returns an empty array for degenerate geometry (no vertices, no storyPolygons)', () => {
    const building = createBuilding({ vertices: [], defaultHeight: 9 });
    expect(getBuildingSolids(building)).toEqual([]);
  });

  it('filters out degenerate story footprints (hTop <= hBottom or < 3 points)', () => {
    const building = createBuilding({
      storyPolygons: [
        { storyIndex: 0, hBottom: 0, hTop: 0, polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] },
        { storyIndex: 1, hBottom: 0, hTop: 3, polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
      ],
    });
    expect(getBuildingSolids(building)).toEqual([]);
  });
});

describe('computeBuildingFrameBounds', () => {
  it('returns exact same radius (framing extent) regardless of building rotation angle in 2D scene', () => {
    // Rectangular building: 10m x 40m, height 12m
    const baseVertices = [
      { x: -5, y: -20 },
      { x: 5, y: -20 },
      { x: 5, y: 20 },
      { x: -5, y: 20 },
    ];

    const anglesDeg = [0, 15, 30, 45, 60, 90, 137.5, 180, 270];
    const computedRadii: number[] = [];

    for (const angleDeg of anglesDeg) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      const rotatedVertices = baseVertices.map((v) => ({
        x: v.x * cosA - v.y * sinA + 100, // + translation offset
        y: v.x * sinA + v.y * cosA - 200,
      }));

      const building = createBuilding({
        vertices: rotatedVertices,
        elevation: 0,
        defaultHeight: 12,
      });

      const solids = getBuildingSolids(building);
      const bounds = computeBuildingFrameBounds(solids);

      expect(bounds).not.toBeNull();
      computedRadii.push(bounds!.radius);
    }

    const firstRadius = computedRadii[0];
    for (const r of computedRadii) {
      expect(r).toBeCloseTo(firstRadius, 6);
    }
  });

  it('returns null for empty solids array', () => {
    expect(computeBuildingFrameBounds([])).toBeNull();
  });
});
