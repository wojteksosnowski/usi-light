import { describe, it, expect } from 'vitest';
import { applyBuildingModifiers, computeStoryHeightIntervals, generateZonePolygon, generateBayWindowPolygon } from './modifierPipeline';
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

  it('without modifiers: generates 4 merged facade segments spanning 0 to 15m and empty storyPolygons', () => {
    const res = applyBuildingModifiers(baseBuilding);
    expect(res.storyPolygons.length).toBe(0);
    expect(res.segments.length).toBe(4);
    for (const seg of res.segments) {
      expect(seg.hBase).toBe(0);
      expect(seg.hTop).toBe(15.0);
    }
  });

  it('for category: boundary with zone_offset modifier: generates zonePolygons, NO storyPolygons and ground segments (hTop = 0)', () => {
    const boundaryBuilding: BuildingLoop = {
      ...baseBuilding,
      id: 'bnd-1',
      category: 'boundary',
      defaultHeight: 0,
      modifiers: [
        {
          id: 'mod-zone-bnd',
          type: 'zone_offset',
          enabled: true,
          distance: 4.0,
          areaType: 'plot',
        },
      ],
    };

    const res = applyBuildingModifiers(boundaryBuilding);
    expect(res.storyPolygons.length).toBe(0);
    expect(res.zonePolygons.length).toBe(1);
    expect(res.zonePolygons[0].polygon.length).toBe(4);
    expect(res.segments.length).toBe(4);
    for (const seg of res.segments) {
      expect(seg.hBase).toBe(0);
      expect(seg.hTop).toBe(0);
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

  it('generates outward and inward zone polygons for ZoneOffsetModifier', () => {
    const squareVertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    // Outward buffer +4m -> 18x18 square from (-4, -4) to (14, 14)
    const outward = generateZonePolygon(squareVertices, 4.0);
    expect(outward.length).toBe(4);
    expect(outward[0].x).toBeCloseTo(-4, 2);
    expect(outward[0].y).toBeCloseTo(-4, 2);
    expect(outward[2].x).toBeCloseTo(14, 2);
    expect(outward[2].y).toBeCloseTo(14, 2);

    // Inward buffer -2m -> 6x6 square from (2, 2) to (8, 8)
    const inward = generateZonePolygon(squareVertices, -2.0);
    expect(inward.length).toBe(4);
    expect(inward[0].x).toBeCloseTo(2, 2);
    expect(inward[0].y).toBeCloseTo(2, 2);
    expect(inward[2].x).toBeCloseTo(8, 2);
    expect(inward[2].y).toBeCloseTo(8, 2);
  });

  it('populates zonePolygons in applyBuildingModifiers when zone_offset modifier is present', () => {
    const bldgWithZone: BuildingLoop = {
      ...baseBuilding,
      modifiers: [
        {
          id: 'mod-zone-1',
          type: 'zone_offset',
          enabled: true,
          distance: 4.0,
          areaType: 'plot',
        },
      ],
    };

    const res = applyBuildingModifiers(bldgWithZone);
    expect(res.zonePolygons.length).toBe(1);
    expect(res.zonePolygons[0].distance).toBe(4.0);
    expect(res.zonePolygons[0].polygon.length).toBe(4);
    expect(res.zonePolygons[0].polygon[0].x).toBeCloseTo(-4, 2);
    expect(res.zonePolygons[0].polygon[0].y).toBeCloseTo(-4, 2);
  });

  it('generates bay window polygon with width and outward/inward projection', () => {
    const squareVertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    // Bay window on edge 0 (bottom edge (0,0) -> (10,0)): outward projection +1.5m, width 4.0m
    const bayPoly = generateBayWindowPolygon(squareVertices, 4.0, 1.5, 0);
    // Should insert 4 points for the bay window into the 4 base vertices -> 8 points total
    expect(bayPoly.length).toBe(8);

    // Normal for edge (0,0)->(10,0) in CCW is (0, -1)
    // Points w1, w2 should have negative y around -1.5
    const minY = Math.min(...bayPoly.map((p) => p.y));
    expect(minY).toBeCloseTo(-1.5, 2);
  });

  it('generates bay window with 90 degree angle (perpendicular rectangle)', () => {
    const squareVertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    // Bay window with sideAngle = 90 on edge 0: width 4m centered (margin = 3m)
    // b1 = (3, 0), w1 = (3, -2), w2 = (7, -2), b2 = (7, 0)
    const bayPoly = generateBayWindowPolygon(squareVertices, 4.0, 2.0, 0, 90, 0.5);
    expect(bayPoly.length).toBe(8);

    const bayPoints = bayPoly.filter((p) => p.y < -0.01);
    expect(bayPoints.length).toBe(2);
    expect(bayPoints[0].x).toBeCloseTo(3, 2);
    expect(bayPoints[0].y).toBeCloseTo(-2, 2);
    expect(bayPoints[1].x).toBeCloseTo(7, 2);
    expect(bayPoints[1].y).toBeCloseTo(-2, 2);
  });

  it('positions bay window along edge according to positionRatio', () => {
    const squareVertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    // positionRatio = 0.0 -> starts at beginning of edge (x = 0)
    const bayPolyStart = generateBayWindowPolygon(squareVertices, 4.0, 2.0, 0, 90, 0.0);
    const startPoints = bayPolyStart.filter((p) => p.y < -0.01);
    expect(startPoints[0].x).toBeCloseTo(0, 2);
    expect(startPoints[1].x).toBeCloseTo(4, 2);

    // positionRatio = 1.0 -> ends at end of edge (x = 10)
    const bayPolyEnd = generateBayWindowPolygon(squareVertices, 4.0, 2.0, 0, 90, 1.0);
    const endPoints = bayPolyEnd.filter((p) => p.y < -0.01);
    expect(endPoints[0].x).toBeCloseTo(6, 2);
    expect(endPoints[1].x).toBeCloseTo(10, 2);
  });

  it('supports multiple modifiers of the same type (e.g. 2 bay windows on different edges)', () => {
    const bldgWith2Bays: BuildingLoop = {
      ...baseBuilding,
      modifiers: [
        {
          id: 'bay-1',
          type: 'bay_window',
          enabled: true,
          width: 4.0,
          projection: 1.5,
          storiesCount: 0,
          edgeIndex: 0,
          sideAngle: 90,
          positionRatio: 0.5,
        },
        {
          id: 'bay-2',
          type: 'bay_window',
          enabled: true,
          width: 3.0,
          projection: 1.0,
          storiesCount: 0,
          edgeIndex: 2, // on opposite edge (10,10)->(0,10)
          sideAngle: 45,
          positionRatio: 0.5,
        },
      ],
    };

    const res = applyBuildingModifiers(bldgWith2Bays);
    expect(res.storyPolygons.length).toBe(5);
    // Story 0 should have both bay windows applied
    expect(res.storyPolygons[0].polygon.length).toBe(12);
  });
});




