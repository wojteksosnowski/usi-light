import { describe, it, expect } from 'vitest';
import { applyBuildingModifiers, computeStoryHeightIntervals } from './modifierPipeline';
import { BuildingLoop } from '../../types/geometry';

describe('modifierPipeline', () => {
  const baseBuilding: BuildingLoop = {
    id: 'bldg-1',
    name: 'Budynek 1',
    layer: '0',
    isTested: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 15.0,
    firstFloorHeight: 3.5,
    typicalFloorHeight: 3.0,
    storeysCount: 5, // 5 kondygnacji: [0..3.5], [3.5..6.5], [6.5..9.5], [9.5..12.5], [12.5..15.0]
    hWindowBottom: 0.85,
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    segments: [],
    isClockwise: false,
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
  };

  it('computes correct story height intervals for 5 storeys', () => {
    const intervals = computeStoryHeightIntervals(baseBuilding);
    expect(intervals.length).toBe(5);
    expect(intervals[0]).toEqual({ hBottom: 0, hTop: 3.5 });
    expect(intervals[1]).toEqual({ hBottom: 3.5, hTop: 6.5 });
    expect(intervals[2]).toEqual({ hBottom: 6.5, hTop: 9.5 });
    expect(intervals[3]).toEqual({ hBottom: 9.5, hTop: 12.5 });
    expect(intervals[4]).toEqual({ hBottom: 12.5, hTop: 15.0 });
  });

  it('without modifiers: generates 4 merged facade segments spanning 0 to 15m', () => {
    const res = applyBuildingModifiers(baseBuilding);
    expect(res.storyPolygons.length).toBe(5);
    expect(res.segments.length).toBe(4);
    for (const seg of res.segments) {
      expect(seg.hBase).toBe(0);
      expect(seg.hTop).toBe(15.0);
    }
  });

  it('with penthouse modifier (-1 story, -2.0m): generates base walls [0..12.5m] and penthouse walls [12.5..15.0m]', () => {
    const bldgWithModifier: BuildingLoop = {
      ...baseBuilding,
      modifiers: [
        {
          id: 'mod-1',
          type: 'story_offset',
          enabled: true,
          distance: -2.0,
          storiesCount: -1, // top 1 story
        },
      ],
    };

    const res = applyBuildingModifiers(bldgWithModifier);
    expect(res.storyPolygons.length).toBe(5);
    // Story 4 should be offset inward (from 10x10 to 6x6: [2,2] to [8,8])
    expect(res.storyPolygons[4].polygon[0].x).toBeCloseTo(2, 2);
    expect(res.storyPolygons[4].polygon[0].y).toBeCloseTo(2, 2);

    // We should have 4 base segments spanning [0, 12.5] and 4 penthouse segments spanning [12.5, 15.0]
    expect(res.segments.length).toBe(8);

    const baseSegs = res.segments.filter((s) => s.hBase === 0 && s.hTop === 12.5);
    const pentSegs = res.segments.filter((s) => s.hBase === 12.5 && s.hTop === 15.0);

    expect(baseSegs.length).toBe(4);
    expect(pentSegs.length).toBe(4);
  });

  it('with ground floor arcade / podcień (+1 story, -1.5m): generates arcade [0..3.5m] and upper cantilever [3.5..15.0m]', () => {
    const bldgWithModifier: BuildingLoop = {
      ...baseBuilding,
      modifiers: [
        {
          id: 'mod-2',
          type: 'story_offset',
          enabled: true,
          distance: -1.5,
          storiesCount: 1, // bottom 1 story
        },
      ],
    };

    const res = applyBuildingModifiers(bldgWithModifier);
    expect(res.segments.length).toBe(8);

    const arcadeSegs = res.segments.filter((s) => s.hBase === 0 && s.hTop === 3.5);
    const upperSegs = res.segments.filter((s) => s.hBase === 3.5 && s.hTop === 15.0);

    expect(arcadeSegs.length).toBe(4);
    expect(upperSegs.length).toBe(4);
  });

  it('translates storyPolygons correctly when building vertices move', () => {
    const bldgWithModifier: BuildingLoop = {
      ...baseBuilding,
      modifiers: [
        {
          id: 'mod-1',
          type: 'story_offset',
          enabled: true,
          distance: -2.0,
          storiesCount: -1,
        },
      ],
    };

    // Przesunięcie o (dx: +10, dy: +5)
    const movedBldg: BuildingLoop = {
      ...bldgWithModifier,
      vertices: bldgWithModifier.vertices.map((v) => ({ x: v.x + 10, y: v.y + 5 })),
    };

    const res = applyBuildingModifiers(movedBldg);
    expect(res.storyPolygons[4].polygon[0].x).toBeCloseTo(12, 2);
    expect(res.storyPolygons[4].polygon[0].y).toBeCloseTo(7, 2);
    expect(res.storyPolygons[0].polygon[0].x).toBeCloseTo(10, 2);
    expect(res.storyPolygons[0].polygon[0].y).toBeCloseTo(5, 2);
  });
});

