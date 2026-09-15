import { describe, it, expect } from 'vitest';
import {
  getMasterplanSolarAngles,
  computeShadowOffsetVector,
  buildShadowSweepPolygon,
  computeConvexHull,
  extractBuildingStoryTiers,
  computeStoryShadowPolygon,
  computeSoftStoryShadowPolygon,
} from './masterplanGeometry';
import { BuildingLoop } from '../../../types/geometry';
import { isPointInPolygon } from '../../../utils/math2d/polygons';

describe('masterplanGeometry', () => {
  it('calculates valid solar angles for equinox at noon', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    expect(angles.elevationDeg).toBeGreaterThan(0);
    expect(angles.elevationDeg).toBeLessThanOrEqual(90);
    expect(angles.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(angles.azimuthDeg).toBeLessThanOrEqual(360);
    expect(Number.isFinite(angles.sunVector.x)).toBe(true);
    expect(Number.isFinite(angles.sunVector.y)).toBe(true);
  });

  it('computes positive shadow offset vector length for positive deltaH', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const offset = computeShadowOffsetVector(15.0, angles);
    expect(offset.length).toBeGreaterThan(0);
    expect(Number.isFinite(offset.dx)).toBe(true);
    expect(Number.isFinite(offset.dy)).toBe(true);
  });

  it('computes 0 offset for non-positive deltaH', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const offset = computeShadowOffsetVector(0, angles);
    expect(offset.length).toBe(0);
    expect(offset.dx).toBe(0);
    expect(offset.dy).toBe(0);
  });

  it('builds a valid sweep polygon for rectangle vertices', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const offset = { dx: 5, dy: 5, length: Math.hypot(5, 5) };
    const sweep = buildShadowSweepPolygon(vertices, offset);
    expect(sweep.length).toBeGreaterThanOrEqual(4);
  });

  it('computes convex hull correctly', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 }, // Punkt wewnętrzny
    ];
    const hull = computeConvexHull(points);
    expect(hull.length).toBe(4);
  });

  it('extracts building story tiers from building with storyPolygons (modifiers)', () => {
    const bldg = {
      id: 'b1',
      name: 'Budynek 1',
      layer: 'Bariery',
      isCityCentre: false,
      buildingType: 'residential',
      category: 'building',
      defaultHeight: 12,
      isTested: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 15 },
        { x: 0, y: 15 },
      ],
      segments: [],
      storyPolygons: [
        {
          storyIndex: 0,
          hBottom: 0,
          hTop: 6,
          polygon: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 15 },
            { x: 0, y: 15 },
          ],
        },
        {
          storyIndex: 1,
          hBottom: 6,
          hTop: 12,
          polygon: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 15 },
            { x: 0, y: 15 },
          ],
        },
      ],
    };

    const tiers = extractBuildingStoryTiers(bldg as unknown as BuildingLoop, 'b1');
    expect(tiers.length).toBe(2);
    expect(tiers[0].hTop).toBe(6);
    expect(tiers[0].hBottom).toBe(0);
    expect(tiers[0].isSelected).toBe(true);
    expect(tiers[0].isProposed).toBe(true);

    expect(tiers[1].hTop).toBe(12);
    expect(tiers[1].hBottom).toBe(6);
    expect(tiers[1].polygon.length).toBe(4);
  });

  it('computes accurate story shadow polygon for convex and concave polygons', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const shadow = computeStoryShadowPolygon(rect, angles, 10, 0);
    expect(shadow.length).toBeGreaterThanOrEqual(4);

    // Self-shading deltaH calculation (e.g. higher floor 6m above lower floor)
    const upperStoryShadow = computeStoryShadowPolygon(rect, angles, 6, 0);
    expect(upperStoryShadow.length).toBeGreaterThanOrEqual(4);
  });

  it('computes soft shadow with a penumbra envelope larger than the umbra', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const { umbra, penumbraOuter } = computeSoftStoryShadowPolygon(rect, angles, 10, 0);
    expect(umbra.length).toBeGreaterThanOrEqual(1);
    expect(penumbraOuter.length).toBeGreaterThanOrEqual(1);

    const area = (poly: { x: number; y: number }[]) => {
      let a = 0;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        a += p1.x * p2.y - p2.x * p1.y;
      }
      return Math.abs(a) / 2;
    };
    const totalArea = (polys: { x: number; y: number }[][]) => polys.reduce((sum, p) => sum + area(p), 0);

    expect(totalArea(penumbraOuter)).toBeGreaterThan(totalArea(umbra));
  });

  it('returns empty result for degenerate soft shadow input', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const result = computeSoftStoryShadowPolygon([], angles, 10, 0);
    expect(result.umbra).toEqual([]);
    expect(result.penumbraOuter).toEqual([]);
  });

  it('has zero penumbra spread at the contact footprint with the ground plane (hBottom=0)', () => {
    const angles = getMasterplanSolarAngles(52.23, 21.01, 'spring', 12.0, 0);
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    // Przy hBottom=0 offset podstawy wynosi {0,0} niezależnie od azymutu (perturbacji ±kąta
    // tarczy słonecznej), więc wierzchołki footprintu budynku muszą leżeć w obu (umbra i
    // penumbraOuter) — zerowa szerokość penumbry w punkcie styku ze ziemią, bez dziury między nimi.
    const { umbra, penumbraOuter } = computeSoftStoryShadowPolygon(rect, angles, 10, 0);
    // Punkty tuż przy narożnikach footprintu (nie dokładnie na granicy, by uniknąć niejednoznaczności
    // testu punkt-na-krawędzi) muszą leżeć w umbrze — brak przerwy/rozjazdu przy styku z gruntem.
    const insetCorners = [
      { x: 0.1, y: 0.1 },
      { x: 9.9, y: 0.1 },
      { x: 9.9, y: 9.9 },
      { x: 0.1, y: 9.9 },
    ];
    for (const v of insetCorners) {
      const inUmbra = umbra.some((poly) => isPointInPolygon(v, poly));
      expect(inUmbra).toBe(true);
    }
  });
});

