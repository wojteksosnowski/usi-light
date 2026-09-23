import { describe, it, expect } from 'vitest';
import { getBuildingWorldInfo, getBuildingGeometrySignature } from './BuildingIsoPreview';
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

describe('getBuildingWorldInfo', () => {
  it('centers a single, unsplit footprint at its own centroid (regression guard, no gate)', () => {
    const building = createBuilding({
      storyPolygons: [
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      ],
    });
    const info = getBuildingWorldInfo(building);
    expect(info).not.toBeNull();
    expect(info!.centroid.x).toBeCloseTo(5, 6);
    expect(info!.centroid.z).toBeCloseTo(-5, 6);
  });

  it('keeps centroid at the geometric center for a symmetric gate-split ground floor', () => {
    // Simulates a `gate` modifier cutting the ground floor into two equal-area wings, as seen
    // when comparing a building with a gate modifier against an identical one without it.
    const building = createBuilding({
      storyPolygons: [
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 10 }] },
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }] },
        { storyIndex: 1, hBottom: 3, hTop: 9, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      ],
    });
    const info = getBuildingWorldInfo(building);
    expect(info).not.toBeNull();
    // Must be the center of the WHOLE footprint (x=5), not of a single fragment (x=2.5 or x=7.5).
    expect(info!.centroid.x).toBeCloseTo(5, 6);
  });

  it('weights the centroid by fragment area for an asymmetric gate-split ground floor', () => {
    const building = createBuilding({
      storyPolygons: [
        // Small wing: 2x10, centroid x=1, area=20
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 10 }, { x: 0, y: 10 }] },
        // Large wing: 8x10, centroid x=6, area=80
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: 2, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 2, y: 10 }] },
        { storyIndex: 1, hBottom: 3, hTop: 9, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      ],
    });
    const info = getBuildingWorldInfo(building);
    expect(info).not.toBeNull();
    // Area-weighted: (1*20 + 6*80) / 100 = 5.0. A close match here already rules out the plain
    // midpoint of the two fragment centroids (3.5) and the naive "first fragment only" bug (1).
    expect(info!.centroid.x).toBeCloseTo(5, 6);
  });

  it('keeps the bounding-box extent identical whether the ground floor is one polygon or split into fragments', () => {
    const wholeFloor = createBuilding({
      storyPolygons: [
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
        { storyIndex: 1, hBottom: 3, hTop: 9, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      ],
    });
    const splitFloor = createBuilding({
      storyPolygons: [
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 10 }] },
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }] },
        { storyIndex: 1, hBottom: 3, hTop: 9, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      ],
    });
    const infoWhole = getBuildingWorldInfo(wholeFloor);
    const infoSplit = getBuildingWorldInfo(splitFloor);
    expect(infoWhole).not.toBeNull();
    expect(infoSplit).not.toBeNull();
    expect(infoSplit!.extent).toEqual(infoWhole!.extent);
  });

  it('produces an identical world info for two translated buildings that only differ by a gate-style split (mod-test5 regression)', () => {
    // Reproduces the reported bug: Budynek1A (gate + donut) vs Budynek1B (donut only), same outer
    // shape, offset in Y. Before the fix, 1A's centroid was biased toward one gate-cut wing,
    // making its camera-framing radius differ from 1B's.
    const withGateSplit = createBuilding({
      id: 'bldg-1A',
      storyPolygons: [
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 20 }, { x: -10, y: 20 }] },
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }] },
        { storyIndex: 1, hBottom: 3, hTop: 15, polygon: [{ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: -10, y: 20 }] },
      ],
    });
    const withoutGateSplit = createBuilding({
      id: 'bldg-1B',
      storyPolygons: [
        { storyIndex: 0, hBottom: 0, hTop: 3, polygon: [{ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: -10, y: 20 }] },
        { storyIndex: 1, hBottom: 3, hTop: 15, polygon: [{ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: -10, y: 20 }] },
      ],
    });
    const infoA = getBuildingWorldInfo(withGateSplit);
    const infoB = getBuildingWorldInfo(withoutGateSplit);
    expect(infoA).not.toBeNull();
    expect(infoB).not.toBeNull();
    expect(infoA!.centroid.x).toBeCloseTo(infoB!.centroid.x, 6);
    expect(infoA!.centroid.z).toBeCloseTo(infoB!.centroid.z, 6);
    expect(infoA!.extent).toEqual(infoB!.extent);
  });
});

describe('getBuildingGeometrySignature', () => {
  it('is invariant under pure translation (tx/ty) to prevent wasteful 3D mesh recreation during drags', () => {
    const base = createBuilding({
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    });
    const moved = createBuilding({
      transform: { tx: 100, ty: -50, rotationDeg: 0 },
    });
    expect(getBuildingGeometrySignature(base)).toBe(getBuildingGeometrySignature(moved));
  });

  it('detects rotation change', () => {
    const base = createBuilding({
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    });
    const rotated = createBuilding({
      transform: { tx: 0, ty: 0, rotationDeg: 45 },
    });
    expect(getBuildingGeometrySignature(base)).not.toBe(getBuildingGeometrySignature(rotated));
  });

  it('detects vertex edit change', () => {
    const base = createBuilding();
    const edited = createBuilding({
      vertices: [
        { x: 0, y: 0 },
        { x: 15, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    });
    expect(getBuildingGeometrySignature(base)).not.toBe(getBuildingGeometrySignature(edited));
  });

  it('detects story and height changes', () => {
    const base = createBuilding({ defaultHeight: 9, storeysCount: 3 });
    const higher = createBuilding({ defaultHeight: 12, storeysCount: 4 });
    expect(getBuildingGeometrySignature(base)).not.toBe(getBuildingGeometrySignature(higher));
  });
});
