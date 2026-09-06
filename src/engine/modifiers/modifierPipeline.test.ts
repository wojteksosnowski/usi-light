import { describe, it, expect } from 'vitest';
import {
  applyBuildingModifiers,
  computeStoryHeightIntervals,
  generateZonePolygon,
  generateBayWindowPolygon,
  generateTerracePolygon,
  generateDonutHoles,
  resolveStoryModifierSteps,
  sanitizeStoryFootprint,
} from './modifierPipeline';
import { BuildingLoop, Point2D } from '../../types/geometry';

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

    const bayPoly = generateBayWindowPolygon(squareVertices, 4.0, 1.5, 0);
    expect(bayPoly.length).toBe(8);

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

    const bayPolyStart = generateBayWindowPolygon(squareVertices, 4.0, 2.0, 0, 90, 0.0);
    const startPoints = bayPolyStart.filter((p) => p.y < -0.01);
    expect(startPoints[0].x).toBeCloseTo(0, 2);
    expect(startPoints[1].x).toBeCloseTo(4, 2);

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
          edgeIndex: 2,
          sideAngle: 45,
          positionRatio: 0.5,
        },
      ],
    };

    const res = applyBuildingModifiers(bldgWith2Bays);
    expect(res.storyPolygons.length).toBe(5);
    expect(res.storyPolygons[0].polygon.length).toBe(12);
  });

  // --- NOWE TESTY DLA MODYFIKATORA TARAS ---
  describe('Terrace modifier', () => {
    const square20m: Point2D[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];

    it('generates terrace setback on a single edge with default -4m depth', () => {
      // Cofnięcie dolnej krawędzi 0 ((0,0)->(20,0)) o -4m przesuwa krawędź do y = 4
      const terracePoly = generateTerracePolygon(square20m, -4.0, 0);
      expect(terracePoly.length).toBe(4);
      expect(terracePoly[0]).toEqual({ x: 0, y: 4 });
      expect(terracePoly[1]).toEqual({ x: 20, y: 4 });
      expect(terracePoly[2]).toEqual({ x: 20, y: 20 });
      expect(terracePoly[3]).toEqual({ x: 0, y: 20 });
    });

    it('generates terrace setback on edge 1 (right wall (20,0)->(20,20))', () => {
      // Cofnięcie prawej krawędzi 1 o -4m przesuwa krawędź do x = 16
      const terracePoly = generateTerracePolygon(square20m, -4.0, 1);
      expect(terracePoly.length).toBe(4);
      expect(terracePoly[0]).toEqual({ x: 0, y: 0 });
      expect(terracePoly[1]).toEqual({ x: 16, y: 0 });
      expect(terracePoly[2]).toEqual({ x: 16, y: 20 });
      expect(terracePoly[3]).toEqual({ x: 0, y: 20 });
    });

    it('applies terrace modifier with storiesCount = -1 on top story in applyBuildingModifiers', () => {
      const bldgWithTerrace: BuildingLoop = {
        ...baseBuilding,
        vertices: square20m,
        modifiers: [
          {
            id: 'terrace-1',
            type: 'terrace',
            enabled: true,
            depth: -4.0,
            storiesCount: -1, // top story only
            edgeIndex: 0,
          },
        ],
      };

      const res = applyBuildingModifiers(bldgWithTerrace);
      expect(res.storyPolygons.length).toBe(5);

      // Kondygnacje 0..3 mają bazowy obrys 20x20
      expect(res.storyPolygons[0].polygon[0]).toEqual({ x: 0, y: 0 });
      expect(res.storyPolygons[3].polygon[0]).toEqual({ x: 0, y: 0 });

      // Kondygnacja 4 (poddasze z tarasem) ma krawędź na y = 4
      expect(res.storyPolygons[4].polygon[0]).toEqual({ x: 0, y: 4 });
      expect(res.storyPolygons[4].polygon[1]).toEqual({ x: 20, y: 4 });

      // Segmenty fasady: krawędź cofnięta rozbija się na dolną ścianę [0, 12.5] i cofniętą ścianę tarasu [12.5, 15.0]
      const terraceWall = res.segments.find((s) => s.hBase === 12.5 && s.hTop === 15.0 && Math.abs(s.p1.y - 4) < 0.01);
      expect(terraceWall).toBeDefined();
    });
  });

  // --- NOWE TESTY DLA MODYFIKATORA DONAT ---
  describe('Donut modifier', () => {
    const square40m: Point2D[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ];

    it('generates inner hole for a 40x40m building with default -12m offset', () => {
      const holes = generateDonutHoles(square40m, -12.0);
      expect(holes.length).toBe(1);
      const hole = holes[0];
      expect(hole.length).toBe(4);

      // Otwór 16x16m od (12, 12) do (28, 28)
      expect(hole[0].x).toBeCloseTo(12, 2);
      expect(hole[0].y).toBeCloseTo(12, 2);
      expect(hole[2].x).toBeCloseTo(28, 2);
      expect(hole[2].y).toBeCloseTo(28, 2);
    });

    it('applies donut modifier across all stories in applyBuildingModifiers and generates patio wall segments', () => {
      const bldgWithDonut: BuildingLoop = {
        ...baseBuilding,
        vertices: square40m,
        modifiers: [
          {
            id: 'donut-1',
            type: 'donut',
            enabled: true,
            offset: -12.0,
            storiesCount: 0, // cała bryła
          },
        ],
      };

      const res = applyBuildingModifiers(bldgWithDonut);
      expect(res.storyPolygons.length).toBe(5);

      // Wszystkie kondygnacje powinny mieć przypisany otwór (hole)
      for (const sf of res.storyPolygons) {
        expect(sf.holes).toBeDefined();
        expect(sf.holes!.length).toBe(1);
        expect(sf.holes![0].length).toBe(4);
      }

      // Powinno powstać 4 segmenty ścian zewnętrznych + 4 segmenty ścian wewnętrznych patio = 8 segmentów
      expect(res.segments.length).toBe(8);

      // Segmenty wewnętrzne patio mają współrzędne w przedziale [12, 28] i normalne zwrócone do wnętrza patio
      const patioSegs = res.segments.filter(
        (s) => s.p1.x >= 11.9 && s.p1.x <= 28.1 && s.p1.y >= 11.9 && s.p1.y <= 28.1
      );
      expect(patioSegs.length).toBe(4);

      // Weryfikacja zwrotu normalnych ścian dziedzińca (wszystkie muszą być skierowane do wnętrza dziedzińca [12..28])
      const bottomPatioWall = patioSegs.find((s) => Math.abs(s.p1.y - 12) < 0.1 && Math.abs(s.p2.y - 12) < 0.1);
      expect(bottomPatioWall).toBeDefined();
      expect(bottomPatioWall!.normal.y).toBeCloseTo(1, 2); // Skierowana w górę (+y) do wnętrza patio

      const topPatioWall = patioSegs.find((s) => Math.abs(s.p1.y - 28) < 0.1 && Math.abs(s.p2.y - 28) < 0.1);
      expect(topPatioWall).toBeDefined();
      expect(topPatioWall!.normal.y).toBeCloseTo(-1, 2); // Skierowana w dół (-y) do wnętrza patio

      const leftPatioWall = patioSegs.find((s) => Math.abs(s.p1.x - 12) < 0.1 && Math.abs(s.p2.x - 12) < 0.1);
      expect(leftPatioWall).toBeDefined();
      expect(leftPatioWall!.normal.x).toBeCloseTo(1, 2); // Skierowana w prawo (+x) do wnętrza patio

      const rightPatioWall = patioSegs.find((s) => Math.abs(s.p1.x - 28) < 0.1 && Math.abs(s.p2.x - 28) < 0.1);
      expect(rightPatioWall).toBeDefined();
      expect(rightPatioWall!.normal.x).toBeCloseTo(-1, 2); // Skierowana w lewo (-x) do wnętrza patio

      // Wszystkie segmenty rozciągają się od 0 do 15m
      for (const seg of res.segments) {
        expect(seg.hBase).toBe(0);
        expect(seg.hTop).toBe(15.0);
      }
    });

    it('supports combination of Donut and Terrace modifiers on one building', () => {
      const bldgCombo: BuildingLoop = {
        ...baseBuilding,
        vertices: square40m,
        modifiers: [
          {
            id: 'donut-1',
            type: 'donut',
            enabled: true,
            offset: -12.0,
            storiesCount: 0, // cała bryła
          },
          {
            id: 'terrace-1',
            type: 'terrace',
            enabled: true,
            depth: -4.0,
            storiesCount: -1, // poddasze z tarasem
            edgeIndex: 0,
          },
        ],
      };

      const res = applyBuildingModifiers(bldgCombo);
      expect(res.storyPolygons.length).toBe(5);

      // Kondygnacja 4 ma uskok tarasu (y = 4) oraz wewnętrzny otwór dziedzińca
      expect(res.storyPolygons[4].polygon[0].y).toBeCloseTo(4, 2);
      expect(res.storyPolygons[4].holes!.length).toBe(1);
    });

    it('allows terrace modifier to target courtyard hole edge (edgeIndex >= 4)', () => {
      const bldgHoleTerrace: BuildingLoop = {
        ...baseBuilding,
        vertices: square40m,
        modifiers: [
          {
            id: 'donut-1',
            type: 'donut',
            enabled: true,
            offset: -12.0,
            storiesCount: 0,
          },
          {
            id: 'terrace-hole',
            type: 'terrace',
            enabled: true,
            depth: -2.0,
            storiesCount: -1,
            edgeIndex: 4, // 1st edge of courtyard hole
          },
        ],
      };

      const res = applyBuildingModifiers(bldgHoleTerrace);
      expect(res.storyPolygons.length).toBe(5);

      // Story 4 hole should have modified edge
      const hole = res.storyPolygons[4].holes![0];
      expect(hole).toBeDefined();
      expect(hole.length).toBe(4);
      // Base hole is [12, 12] to [28, 28]. Modifying bottom edge of hole with setback shifts it
      expect(hole[0].y).not.toBe(res.storyPolygons[0].holes![0][0].y);
    });
  });

  // --- TESTY DLA RESOLVERA ZAKRESU KONDYGNACJI (resolveStoryModifierSteps) ---
  describe('resolveStoryModifierSteps', () => {
    it('resolves uniform steps (cascade: false)', () => {
      // 5 storeys, top 2 (-2)
      const top2 = resolveStoryModifierSteps(5, -2, { cascade: false });
      expect(top2.length).toBe(2);
      expect(top2[0].storyIndex).toBe(3);
      expect(top2[0].stepMultiplier).toBe(1);
      expect(top2[1].storyIndex).toBe(4);
      expect(top2[1].stepMultiplier).toBe(1);

      // 5 storeys, bottom 2 (+2)
      const bottom2 = resolveStoryModifierSteps(5, 2, { cascade: false });
      expect(bottom2.length).toBe(2);
      expect(bottom2[0].storyIndex).toBe(0);
      expect(bottom2[0].stepMultiplier).toBe(1);
      expect(bottom2[1].storyIndex).toBe(1);
      expect(bottom2[1].stepMultiplier).toBe(1);

      // 5 storeys, all (0)
      const all = resolveStoryModifierSteps(5, 0, { cascade: false });
      expect(all.length).toBe(5);
      expect(all.every((s) => s.stepMultiplier === 1)).toBe(true);
    });

    it('resolves cascading steps for top storeys (storiesCount < 0: multiplier grows towards top)', () => {
      // 5 storeys, top 3 (-3) -> stories 2, 3, 4 with multipliers 1, 2, 3
      const top3Cascade = resolveStoryModifierSteps(5, -3, { cascade: true });
      expect(top3Cascade.length).toBe(3);
      expect(top3Cascade[0]).toEqual({ storyIndex: 2, stepMultiplier: 1, isBottomLevel: true, isTopLevel: false });
      expect(top3Cascade[1]).toEqual({ storyIndex: 3, stepMultiplier: 2, isBottomLevel: false, isTopLevel: false });
      expect(top3Cascade[2]).toEqual({ storyIndex: 4, stepMultiplier: 3, isBottomLevel: false, isTopLevel: true });
    });

    it('resolves cascading steps for bottom storeys (storiesCount > 0: multiplier grows towards bottom/ground)', () => {
      // 5 storeys, bottom 3 (+3) -> stories 0, 1, 2 with multipliers 3, 2, 1
      const bottom3Cascade = resolveStoryModifierSteps(5, 3, { cascade: true });
      expect(bottom3Cascade.length).toBe(3);
      expect(bottom3Cascade[0]).toEqual({ storyIndex: 0, stepMultiplier: 3, isBottomLevel: true, isTopLevel: false });
      expect(bottom3Cascade[1]).toEqual({ storyIndex: 1, stepMultiplier: 2, isBottomLevel: false, isTopLevel: false });
      expect(bottom3Cascade[2]).toEqual({ storyIndex: 2, stepMultiplier: 1, isBottomLevel: false, isTopLevel: true });
    });

    it('resolves cascading steps for whole building (storiesCount = 0: multiplier grows from ground up)', () => {
      // 5 storeys, all -> stories 0..4 with multipliers 1, 2, 3, 4, 5
      const allCascade = resolveStoryModifierSteps(5, 0, { cascade: true });
      expect(allCascade.length).toBe(5);
      expect(allCascade.map((s) => s.stepMultiplier)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('Cascading Terrace on Building', () => {
    const square30m: Point2D[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 0, y: 30 },
    ];

    it('applies stepped setbacks for storiesCount = -3 and depth = -4m on a 5-story building', () => {
      const bldgCascading: BuildingLoop = {
        ...baseBuilding,
        vertices: square30m,
        modifiers: [
          {
            id: 'terrace-cascade',
            type: 'terrace',
            enabled: true,
            depth: -4.0,
            storiesCount: -3, // 3 top storeys: story 2 (-4m), story 3 (-8m), story 4 (-12m)
            edgeIndex: 0, // bottom wall (0,0)->(30,0)
          },
        ],
      };

      const res = applyBuildingModifiers(bldgCascading);
      expect(res.storyPolygons.length).toBe(5);

      // Stories 0 and 1 have un-modified y = 0
      expect(res.storyPolygons[0].polygon[0].y).toBeCloseTo(0, 2);
      expect(res.storyPolygons[1].polygon[0].y).toBeCloseTo(0, 2);

      // Story 2 (3rd floor) setback 1x: y = 4
      expect(res.storyPolygons[2].polygon[0].y).toBeCloseTo(4, 2);
      expect(res.storyPolygons[2].polygon[1].y).toBeCloseTo(4, 2);

      // Story 3 (4th floor) setback 2x: y = 8
      expect(res.storyPolygons[3].polygon[0].y).toBeCloseTo(8, 2);
      expect(res.storyPolygons[3].polygon[1].y).toBeCloseTo(8, 2);

      // Story 4 (5th floor) setback 3x: y = 12
      expect(res.storyPolygons[4].polygon[0].y).toBeCloseTo(12, 2);
      expect(res.storyPolygons[4].polygon[1].y).toBeCloseTo(12, 2);
    });
  });

  describe('sanitizeStoryFootprint (Universal Geometric Sanitizer & Clipper)', () => {
    const square30m: Point2D[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 0, y: 30 },
    ];

    it('retains enclosed inner hole when fully inside outer polygon', () => {
      const hole: Point2D[] = [
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 20 },
        { x: 10, y: 20 },
      ];
      const footprint = {
        storyIndex: 0,
        hBottom: 0,
        hTop: 3.5,
        polygon: square30m,
        holes: [hole],
      };

      const sanitized = sanitizeStoryFootprint(footprint);
      expect(sanitized.polygon.length).toBe(4);
      expect(sanitized.holes).toBeDefined();
      expect(sanitized.holes!.length).toBe(1);
      expect(sanitized.holes![0].length).toBe(4);
    });

    it('merges hole into outer polygon when hole breaches outer wall (creating U-shape / notch)', () => {
      // Hole crossing top wall from y=15 to y=35 (outer wall is at y=30)
      const breachingHole: Point2D[] = [
        { x: 10, y: 15 },
        { x: 20, y: 15 },
        { x: 20, y: 35 },
        { x: 10, y: 35 },
      ];
      const footprint = {
        storyIndex: 0,
        hBottom: 0,
        hTop: 3.5,
        polygon: square30m,
        holes: [breachingHole],
      };

      const sanitized = sanitizeStoryFootprint(footprint);
      // Outer polygon is now a U-shaped 8-vertex polygon
      expect(sanitized.polygon.length).toBe(8);
      // Hole is merged into outer perimeter, so enclosed holes list is empty
      expect(sanitized.holes!.length).toBe(0);
    });

    it('discards hole when it lies completely outside outer polygon', () => {
      const outsideHole: Point2D[] = [
        { x: 50, y: 50 },
        { x: 60, y: 50 },
        { x: 60, y: 60 },
        { x: 50, y: 60 },
      ];
      const footprint = {
        storyIndex: 0,
        hBottom: 0,
        hTop: 3.5,
        polygon: square30m,
        holes: [outsideHole],
      };

      const sanitized = sanitizeStoryFootprint(footprint);
      expect(sanitized.polygon.length).toBe(4);
      expect(sanitized.holes!.length).toBe(0);
    });
  });

  describe('Real-World Scenario: reference/test-modyfikatorow-2.json', () => {
    // Vertices and modifiers from reference/test-modyfikatorow-2.json
    const testBldg: BuildingLoop = {
      id: 'bldg-1788709205061',
      name: 'Budynek (Prostokąt 3)',
      layer: 'BUD_NOWY',
      isTested: false,
      category: 'building',
      elevation: 0,
      firstFloorHeight: 3.5,
      typicalFloorHeight: 3,
      storeysCount: 5,
      buildingType: 'residential',
      defaultHeight: 16,
      hWindowBottom: 0.85,
      isCityCentre: false,
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
      vertices: [
        { x: -4.623708542527083, y: 50.49573424346656 },
        { x: 53.15230347759788, y: 50.49573424346656 },
        { x: 41.861357261606756, y: -3.290946215991168 },
        { x: -4.623708542527083, y: 1.9686888045257849 },
      ],
      segments: [],
      modifiers: [
        {
          id: 'mod-donut-test',
          type: 'donut',
          enabled: true,
          offset: -12.0,
          storiesCount: 0,
        },
        {
          id: 'mod-terrace-test',
          type: 'terrace',
          enabled: true,
          depth: -5.0,
          storiesCount: -4,
          edgeIndex: 0,
        },
      ],
    };

    it('resolves story 4 without crossing outer walls and courtyard hole edges', () => {
      const res = applyBuildingModifiers(testBldg);
      expect(res.storyPolygons.length).toBe(5);

      // On story 4 (5th storey), terrace stepped setback has reached y ~ 30.5
      // The donut hole (y from 12.7 to 38.5) crosses the top outer wall.
      // Sanitizer merges the open courtyard into the outer perimeter or trims it cleanly.
      const story4 = res.storyPolygons[4];
      expect(story4).toBeDefined();

      // Ensure no hole vertex lies outside the outer polygon y boundary
      const outerMaxY = Math.max(...story4.polygon.map((p) => p.y));
      if (story4.holes && story4.holes.length > 0) {
        for (const hole of story4.holes) {
          for (const hp of hole) {
            expect(hp.y).toBeLessThanOrEqual(outerMaxY + 0.01);
          }
        }
      }

      // Ensure all segments have non-zero positive length and valid normals
      expect(res.segments.length).toBeGreaterThan(0);
      for (const seg of res.segments) {
        expect(seg.length).toBeGreaterThan(0.01);
        expect(isNaN(seg.normal.x)).toBe(false);
        expect(isNaN(seg.normal.y)).toBe(false);
        expect(seg.hTop ?? 0).toBeGreaterThanOrEqual(seg.hBase ?? 0);
      }
    });
  });
});





