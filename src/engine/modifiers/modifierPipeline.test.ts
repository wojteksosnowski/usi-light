import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  applyBuildingModifiers,
  computeStoryHeightIntervals,
  generateZonePolygon,
  generateZoneBand,
  generateBayWindowPolygon,
  generateTerracePolygon,
  generateDonutHoles,
  generateCornerCutPolygon,
  generatePilaPolygon,
  calculatePilaMetrics,
  splitFootprintByEdgeOffset,
  resolveStoryModifierSteps,
  sanitizeStoryFootprint,
} from './modifierPipeline';
import { BuildingLoop, Point2D } from '../../types/geometry';
import { Modifier } from '../../types/modifiers';
import { calculateSignedArea, isPolygonCCW } from '../../utils/math2d/polygons';
import { getBuildingSolids } from '../preview/buildingIsoGeometry';

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
    expect(res.zonePolygons[0].holes?.[0]?.length).toBe(4);
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

  it('generateZoneBand: builds the band between the original edge and the offset line', () => {
    const squareVertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    // Positive distance -> outer boundary is the offset polygon, inner is the original edge
    const outwardBand = generateZoneBand(squareVertices, 4.0, 'miter');
    expect(outwardBand.outer[0].x).toBeCloseTo(-4, 2);
    expect(outwardBand.outer[0].y).toBeCloseTo(-4, 2);
    expect(outwardBand.inner).toEqual(squareVertices);

    // Negative distance -> outer boundary is the original edge, inner is the offset polygon
    const inwardBand = generateZoneBand(squareVertices, -2.0, 'miter');
    expect(inwardBand.outer).toEqual(squareVertices);
    expect(inwardBand.inner[0].x).toBeCloseTo(2, 2);
    expect(inwardBand.inner[0].y).toBeCloseTo(2, 2);
  });

  it('generateZoneBand: chamfer corner type bevels each corner into two points', () => {
    const squareVertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const band = generateZoneBand(squareVertices, 2.0, 'chamfer');
    expect(band.outer.length).toBe(8);
  });

  it('generateZoneBand: round corner type adds arc segments at each corner', () => {
    const squareVertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const band = generateZoneBand(squareVertices, 2.0, 'round');
    expect(band.outer.length).toBeGreaterThan(4);
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
      // Base hole is modified with setback (shifts edge by -2m)
      expect(hole).not.toEqual(res.storyPolygons[0].holes![0]);
      expect(Math.abs(calculateSignedArea(hole))).not.toBeCloseTo(
        Math.abs(calculateSignedArea(res.storyPolygons[0].holes![0]))
      );
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

    it('applies stepped setbacks for storiesCount = -3 and depth = -6m on a 5-story building with variant = steps so total setback is 6m', () => {
      const bldgCascading: BuildingLoop = {
        ...baseBuilding,
        vertices: square30m,
        modifiers: [
          {
            id: 'terrace-cascade',
            type: 'terrace',
            enabled: true,
            depth: -6.0,
            storiesCount: -3, // 3 top storeys: story 2 (-2m), story 3 (-4m), story 4 (-6m = total 'a')
            edgeIndex: 0, // bottom wall (0,0)->(30,0)
            variant: 'steps',
          },
        ],
      };

      const res = applyBuildingModifiers(bldgCascading);
      expect(res.storyPolygons.length).toBe(5);

      // Stories 0 and 1 have un-modified y = 0
      expect(res.storyPolygons[0].polygon[0].y).toBeCloseTo(0, 2);
      expect(res.storyPolygons[1].polygon[0].y).toBeCloseTo(0, 2);

      // Story 2 (3rd floor) setback 1/3: y = 2
      expect(res.storyPolygons[2].polygon[0].y).toBeCloseTo(2, 2);
      expect(res.storyPolygons[2].polygon[1].y).toBeCloseTo(2, 2);

      // Story 3 (4th floor) setback 2/3: y = 4
      expect(res.storyPolygons[3].polygon[0].y).toBeCloseTo(4, 2);
      expect(res.storyPolygons[3].polygon[1].y).toBeCloseTo(4, 2);

      // Story 4 (5th floor) setback 3/3: y = 6 (total 'a')
      expect(res.storyPolygons[4].polygon[0].y).toBeCloseTo(6, 2);
      expect(res.storyPolygons[4].polygon[1].y).toBeCloseTo(6, 2);
    });

    it('applies uniform setback for storiesCount = -3 with variant = drop', () => {
      const bldgDrop: BuildingLoop = {
        ...baseBuilding,
        vertices: square30m,
        modifiers: [
          {
            id: 'terrace-drop',
            type: 'terrace',
            enabled: true,
            depth: -4.0,
            storiesCount: -3, // 3 top storeys: story 2, 3, 4 each -4m
            edgeIndex: 0,
            variant: 'drop',
          },
        ],
      };

      const res = applyBuildingModifiers(bldgDrop);
      expect(res.storyPolygons.length).toBe(5);

      // Stories 0 and 1 have un-modified y = 0
      expect(res.storyPolygons[0].polygon[0].y).toBeCloseTo(0, 2);
      expect(res.storyPolygons[1].polygon[0].y).toBeCloseTo(0, 2);

      // Stories 2, 3, 4 have uniform setback 1x (-4m -> y = 4)
      expect(res.storyPolygons[2].polygon[0].y).toBeCloseTo(4, 2);
      expect(res.storyPolygons[3].polygon[0].y).toBeCloseTo(4, 2);
      expect(res.storyPolygons[4].polygon[0].y).toBeCloseTo(4, 2);
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

  describe('Corner cut modifier', () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    it('chamfer on a single vertex replaces it with 2 points and reduces area by d*d/2', () => {
      const d = 1;
      const result = generateCornerCutPolygon(square, d, 'chamfer', 'vertex', 0);
      expect(result.length).toBe(5);
      const origArea = Math.abs(calculateSignedArea(square));
      const newArea = Math.abs(calculateSignedArea(result));
      expect(origArea - newArea).toBeCloseTo((d * d) / 2, 5);
      expect(isPolygonCCW(result)).toBe(true);
    });

    it('fillet on a corner samples an arc and stays within d of the original vertex', () => {
      const d = 1;
      const result = generateCornerCutPolygon(square, d, 'fillet', 'vertex', 0);
      expect(result.length).toBeGreaterThan(5);
      const curr = square[0];
      const arcPointCount = result.length - 3; // total - (3 untouched vertices)
      for (let i = 0; i < arcPointCount; i++) {
        const p = result[i];
        const dist = Math.hypot(p.x - curr.x, p.y - curr.y);
        expect(dist).toBeLessThanOrEqual(d + 1e-6);
      }
    });

    it('notch/rhombus replaces vertex with 3 points, all 4 sides equal to d', () => {
      const d = 1;
      const result = generateCornerCutPolygon(square, d, 'notch', 'vertex', 0);
      expect(result.length).toBe(6);
      // result: [A, M, B, orig1, orig2, orig3] since vertex 0 replaced
      const [A, M, B] = result;
      const curr = square[0];
      const dist = (p1: Point2D, p2: Point2D) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
      expect(dist(curr, A)).toBeCloseTo(d, 5);
      expect(dist(A, M)).toBeCloseTo(d, 5);
      expect(dist(M, B)).toBeCloseTo(d, 5);
      expect(dist(B, curr)).toBeCloseTo(d, 5);
    });

    it('scope=edge cuts both endpoints of the target edge only', () => {
      const d = 1;
      const result = generateCornerCutPolygon(square, d, 'chamfer', 'edge', 0);
      // vertices 0 and 1 are endpoints of edge 0 -> each replaced by 2 points = 4, plus untouched 2, 3
      expect(result.length).toBe(6);
    });

    it('scope=all cuts every vertex of the square', () => {
      const d = 1;
      const result = generateCornerCutPolygon(square, d, 'chamfer', 'all');
      expect(result.length).toBe(8);
    });

    it('clamps d to half the adjacent edge length to avoid self-intersection', () => {
      const small: Point2D[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const result = generateCornerCutPolygon(small, 10, 'chamfer', 'all');
      for (const p of result) {
        expect(isNaN(p.x)).toBe(false);
        expect(isNaN(p.y)).toBe(false);
      }
      expect(isPolygonCCW(result)).toBe(true);
      const newArea = Math.abs(calculateSignedArea(result));
      expect(newArea).toBeGreaterThan(0);
      expect(newArea).toBeLessThan(1.0);
    });

    it('returns an unchanged copy when d <= 0', () => {
      const result = generateCornerCutPolygon(square, 0, 'chamfer', 'all');
      expect(result).toEqual(square);
    });

    it('applies through the pipeline and reflects the cut in storyPolygons', () => {
      const building: BuildingLoop = {
        id: 'bldg-cut',
        name: 'Budynek ciecie',
        layer: '0',
        isTested: true,
        isCityCentre: false,
        buildingType: 'residential',
        defaultHeight: 6.0,
        firstFloorHeight: 3.0,
        typicalFloorHeight: 3.0,
        storeysCount: 2,
        hWindowBottom: 0.85,
        vertices: square,
        segments: [],
        isClockwise: false,
        transform: { tx: 0, ty: 0, rotationDeg: 0 },
        modifiers: [
          {
            id: 'mod-cut-test',
            type: 'corner_cut',
            enabled: true,
            depth: 1.0,
            storiesCount: 0,
            mode: 'chamfer',
            scope: 'all',
          },
        ],
      };

      const res = applyBuildingModifiers(building);
      expect(res.storyPolygons.length).toBe(2);
      for (const sf of res.storyPolygons) {
        expect(sf.polygon.length).toBe(8);
      }
    });

    it('handles U-shaped building with terrace and corner_cut (mod-test1 regression)', () => {
      // 8-vertex U-shaped building from reference/mod-test1.json
      const uShapeVertices: Point2D[] = [
        { x: -55.958975062954416, y: 16.00415738086747 },
        { x: -56.51995114594727, y: 48.14245565130253 },
        { x: -19.88095105747405, y: 48.474259725508404 },
        { x: -10.147090211546056, y: 25.798444853458044 },
        { x: -21.174072415680058, y: 21.064982751601526 },
        { x: -27.757854233919197, y: 36.40243415258554 },
        { x: -44.31058382098414, y: 36.252532050919186 },
        { x: -43.96080272107772, y: 16.213586258114866 },
      ];

      const uBuilding: BuildingLoop = {
        id: 'bldg-u-test',
        name: 'Budynek U',
        layer: 'BUD_NOWY',
        isTested: true,
        isCityCentre: false,
        buildingType: 'residential',
        defaultHeight: 15.0,
        firstFloorHeight: 3.0,
        typicalFloorHeight: 3.0,
        storeysCount: 5,
        hWindowBottom: 0.85,
        vertices: uShapeVertices,
        segments: [],
        isClockwise: false,
        transform: { tx: 0, ty: 0, rotationDeg: 0 },
        modifiers: [
          {
            id: 'mod-terrace-test',
            type: 'terrace',
            enabled: true,
            depth: -12,
            storiesCount: -1, // top story (index 4)
            variant: 'drop',
            edgeIndex: 0,
            autoDistance: true,
          },
          {
            id: 'mod-cut-test',
            type: 'corner_cut',
            enabled: true,
            depth: 4,
            storiesCount: 0, // all stories
            mode: 'chamfer',
            scope: 'all',
          },
        ],
      };

      const res = applyBuildingModifiers(uBuilding);
      expect(res.storyPolygons.length).toBe(5);

      // Stories 0..3 have 8 corners chamfered -> 16 vertices
      for (let s = 0; s < 4; s++) {
        expect(res.storyPolygons[s].polygon.length).toBe(16);
      }

      // Story 4 (top story with 12m terrace setback on edge 0):
      // The western wing collapses into a clean outer wall.
      // Every corner should be chamfered cleanly without inverted/self-intersecting segments.
      const topStory = res.storyPolygons[4];
      expect(topStory.polygon.length).toBeGreaterThanOrEqual(8);
      expect(isPolygonCCW(topStory.polygon)).toBe(true);

      // Verify that all points have valid coordinates
      for (const pt of topStory.polygon) {
        expect(isNaN(pt.x)).toBe(false);
        expect(isNaN(pt.y)).toBe(false);
      }

      // Verify area is positive and smaller than base footprint
      const baseArea = Math.abs(calculateSignedArea(uShapeVertices));
      const topArea = Math.abs(calculateSignedArea(topStory.polygon));
      expect(topArea).toBeGreaterThan(100);
      expect(topArea).toBeLessThan(baseArea);
    });
  });

  // --- NOWE TESTY DLA MODYFIKATORA BRAMA (GATE) ---
  describe('Gate modifier', () => {
    const rect30x15: Point2D[] = [
      { x: 0, y: 0 },    // krawędź 0: dolna ściana y=0 (0,0)->(30,0)
      { x: 30, y: 0 },   // krawędź 1: prawa ściana x=30 (30,0)->(30,15)
      { x: 30, y: 15 },  // krawędź 2: górna ściana y=15 (30,15)->(0,15)
      { x: 0, y: 15 },   // krawędź 3: lewa ściana x=0 (0,15)->(0,0)
    ];

    it('cuts a ground floor gate passage (storiesCount = 1, width = 6m, position = 0.5) on a 5-story building', () => {
      const bldgWithGate: BuildingLoop = {
        ...baseBuilding,
        vertices: rect30x15,
        modifiers: [
          {
            id: 'gate-ground',
            type: 'gate',
            enabled: true,
            width: 6.0,
            storiesCount: 1, // parter (storyIndex 0)
            edgeIndex: 0,
            positionRatio: 0.5,
          },
        ],
      };

      const res = applyBuildingModifiers(bldgWithGate);
      // Story 0 is split into 2 footprints (left wing x=[0..12], right wing x=[18..30]),
      // and stories 1..4 have 1 full footprint each -> total 6 story footprints
      expect(res.storyPolygons.length).toBe(6);

      const groundPolys = res.storyPolygons.filter((s) => s.storyIndex === 0);
      expect(groundPolys.length).toBe(2);

      // Lewe skrzydło parteru: x od 0 do 12
      const leftPoly = groundPolys.find((p) => p.polygon.some((pt) => Math.abs(pt.x - 0) < 0.1 && Math.abs(pt.y - 0) < 0.1));
      expect(leftPoly).toBeDefined();
      const leftMaxX = Math.max(...leftPoly!.polygon.map((p) => p.x));
      expect(leftMaxX).toBeCloseTo(12, 1);

      // Prawe skrzydło parteru: x od 18 do 30
      const rightPoly = groundPolys.find((p) => p.polygon.some((pt) => Math.abs(pt.x - 30) < 0.1 && Math.abs(pt.y - 0) < 0.1));
      expect(rightPoly).toBeDefined();
      const rightMinX = Math.min(...rightPoly!.polygon.map((p) => p.x));
      expect(rightMinX).toBeCloseTo(18, 1);

      // Wyższe kondygnacje (1..4) mają pełny obrys 30x15
      for (let s = 1; s <= 4; s++) {
        const story = res.storyPolygons.find((p) => p.storyIndex === s);
        expect(story).toBeDefined();
        expect(story!.polygon.length).toBe(4);
      }

      // Weryfikacja segmentów pionowych ścian bramy:
      // Powinny powstać ściany tunelu przy x=12 i x=18 dla hBase=0, hTop=3.5
      const tunnelLeft = res.segments.find(
        (s) => Math.abs(s.p1.x - 12) < 0.1 && Math.abs(s.p2.x - 12) < 0.1 && s.hBase === 0 && s.hTop === 3.5
      );
      expect(tunnelLeft).toBeDefined();

      const tunnelRight = res.segments.find(
        (s) => Math.abs(s.p1.x - 18) < 0.1 && Math.abs(s.p2.x - 18) < 0.1 && s.hBase === 0 && s.hTop === 3.5
      );
      expect(tunnelRight).toBeDefined();
    });

    it('cuts gate across the whole building (storiesCount = 0) splitting it into 2 separate buildings', () => {
      const bldgFullGate: BuildingLoop = {
        ...baseBuilding,
        vertices: rect30x15,
        modifiers: [
          {
            id: 'gate-all',
            type: 'gate',
            enabled: true,
            width: 4.0,
            storiesCount: 0, // cała bryła
            edgeIndex: 0,
            positionRatio: 0.5,
          },
        ],
      };

      const res = applyBuildingModifiers(bldgFullGate);
      // All 5 stories are split into 2 footprints -> total 10 story footprints
      expect(res.storyPolygons.length).toBe(10);

      // Każda kondygnacja ma dokładnie 2 części
      for (let s = 0; s < 5; s++) {
        const storyParts = res.storyPolygons.filter((p) => p.storyIndex === s);
        expect(storyParts.length).toBe(2);
      }

      // Wszystkie segmenty rozciągają się od 0 do 15m
      for (const seg of res.segments) {
        expect(seg.hBase).toBe(0);
        expect(seg.hTop).toBe(15.0);
      }
    });

    it('cuts entrance into courtyard hole on ground floor when combined with Donut modifier', () => {
      const square40: Point2D[] = [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 0, y: 40 },
      ];

      const bldgDonutGate: BuildingLoop = {
        ...baseBuilding,
        vertices: square40,
        modifiers: [
          {
            id: 'donut-1',
            type: 'donut',
            enabled: true,
            offset: -12.0, // dziedziniec [12..28, 12..28]
            storiesCount: 0, // cała bryła
          },
          {
            id: 'gate-courtyard',
            type: 'gate',
            enabled: true,
            width: 4.0, // brama 4m do dziedzińca
            storiesCount: 1, // tylko w parterze
            edgeIndex: 0,
            positionRatio: 0.5,
          },
        ],
      };

      const res = applyBuildingModifiers(bldgDonutGate);
      expect(res.storyPolygons.length).toBe(5);

      // Parter (storyIndex 0): dziedziniec połączony z zewnątrz (kształt litery U/C z 0 zamkniętymi otworami wewnętrznymi)
      const groundStory = res.storyPolygons.find((s) => s.storyIndex === 0);
      expect(groundStory).toBeDefined();
      expect(groundStory!.holes?.length || 0).toBe(0); // Brak zamkniętego otworu - otwór scalony z obwodem zewnętrznym
      expect(groundStory!.polygon.length).toBeGreaterThan(4); // Wielokąt U-kształtny

      // Piętra 1..4: nadal mają nienaruszony, zamknięty wewnętrzny dziedziniec
      for (let s = 1; s <= 4; s++) {
        const upperStory = res.storyPolygons.find((p) => p.storyIndex === s);
        expect(upperStory).toBeDefined();
        expect(upperStory!.holes).toBeDefined();
        expect(upperStory!.holes!.length).toBe(1);
      }
    });
  });

  describe('Real-world reference files: geometry stability', () => {
    // `reference/` is gitignored (local scratch/debug fixtures), so these files may not exist in
    // every checkout or in CI. These tests are a bonus stability check when the fixtures happen to
    // be present locally; they skip cleanly (rather than failing) when they're not.
    const referenceFileExists = (fileName: string) =>
      fs.existsSync(path.resolve(__dirname, '../../../reference', fileName));

    const loadReferenceBuilding = (fileName: string, buildingName?: string): BuildingLoop => {
      const filePath = path.resolve(__dirname, '../../../reference', fileName);
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const building = buildingName
        ? raw.buildings.find((b: BuildingLoop) => b.name === buildingName)
        : raw.buildings[0];
      return building as BuildingLoop;
    };

    const area = (poly: Point2D[]) => Math.abs(calculateSignedArea(poly));
    const sortedAreas = (wings: { polygon: Point2D[] }[]) =>
      wings.map((w) => area(w.polygon)).sort((a, b) => a - b);
    const gateOnly = (building: BuildingLoop) =>
      applyBuildingModifiers({ ...building, modifiers: building.modifiers!.filter((m) => m.type === 'gate') });

    it.skipIf(!referenceFileExists('mod-test2.json'))(
      'mod-test2.json: gate splits stories 2-4 into wings, story_offset only insets story 4 (both wings)',
      () => {
      const building = loadReferenceBuilding('mod-test2.json');
      const res = applyBuildingModifiers(building);

      const story2Wings = res.storyPolygons.filter((s) => s.storyIndex === 2);
      const story3Wings = res.storyPolygons.filter((s) => s.storyIndex === 3);
      const story4Wings = res.storyPolygons.filter((s) => s.storyIndex === 4);
      expect(story2Wings.length).toBe(2);
      expect(story3Wings.length).toBe(2);
      expect(story4Wings.length).toBe(2);

      // Story 2 and 3 are both untouched by story_offset (only story 4 = storiesCount:-1 is targeted),
      // so their wing areas (purely a function of the gate cut, same footprint shape) must match.
      const story2Areas = sortedAreas(story2Wings);
      const story3Areas = sortedAreas(story3Wings);
      expect(story3Areas[0]).toBeCloseTo(story2Areas[0], 3);
      expect(story3Areas[1]).toBeCloseTo(story2Areas[1], 3);

      // Story 4 must be inset (smaller area than story 3's matching wing) by the -2m offset.
      const story4Areas = sortedAreas(story4Wings);
      expect(story4Areas[0]).toBeLessThan(story3Areas[0]);
      expect(story4Areas[1]).toBeLessThan(story3Areas[1]);
      }
    );

    it.skipIf(!referenceFileExists('mod-test3.json'))(
      'mod-test3.json: gate splits story 2 into wings, terrace edgeIndex:0 affects only one wing (no leakage)',
      () => {
      const building = loadReferenceBuilding('mod-test3.json');
      const res = applyBuildingModifiers(building);

      const story2Wings = res.storyPolygons.filter((s) => s.storyIndex === 2);
      expect(story2Wings.length).toBe(2);

      // Compute what gate alone (no terrace) would have produced for story 2, to diff against.
      const gateOnlyRes = gateOnly(building);
      const gateOnlyStory2Wings = gateOnlyRes.storyPolygons.filter((s) => s.storyIndex === 2);
      expect(gateOnlyStory2Wings.length).toBe(2);

      const gateOnlyAreas = sortedAreas(gateOnlyStory2Wings);
      const afterTerraceAreas = sortedAreas(story2Wings);

      // Exactly one wing must differ from its gate-only shape (the terrace target);
      // the other must be unchanged (no leakage into the second loop).
      const diffs = [0, 1].map((i) => Math.abs(afterTerraceAreas[i] - gateOnlyAreas[i]));
      const changedCount = diffs.filter((d) => d > 1e-3).length;
      expect(changedCount).toBe(1);

      // Stories 3 and 4 (not split by gate) still get the terrace setback normally.
      for (const s of [3, 4]) {
        const gateOnlyStory = gateOnlyRes.storyPolygons.find((p) => p.storyIndex === s);
        const afterTerraceStory = res.storyPolygons.find((p) => p.storyIndex === s);
        expect(gateOnlyStory).toBeDefined();
        expect(afterTerraceStory).toBeDefined();
        expect(area(afterTerraceStory!.polygon)).toBeLessThan(area(gateOnlyStory!.polygon));
      }
      }
    );

    it.skipIf(!referenceFileExists('mod-test4.json'))(
      'mod-test4.json: an earlier gate step must not corrupt a later edge-targeted terrace on UNRELATED, unsplit stories',
      () => {
      // Regression test: sanitizeStoryFootprint's boolean-union cleanup (run after every modifier
      // step, on every story) can silently reorder/renumber a footprint's vertex array. Even a
      // story `gate` never touches (here: stories 3-4, since gate's storiesCount:3 only covers
      // stories 0-2) can have its terrace edgeIndex mis-resolved if that index is treated as a raw
      // position rather than being re-matched geometrically against the original base vertices.
      const raw = loadReferenceBuilding('mod-test4.json', 'Budynek1');
      const gateDisabled: BuildingLoop = raw;
      const gateEnabled: BuildingLoop = {
        ...raw,
        modifiers: raw.modifiers!.map((m) => (m.type === 'gate' ? { ...m, enabled: true } : m)),
      };

      const resOff = applyBuildingModifiers(gateDisabled);
      const resOn = applyBuildingModifiers(gateEnabled);

      // Stories 3 and 4 are never targeted by gate (storiesCount:3 -> stories 0,1,2 only), so
      // enabling/disabling gate must have ZERO effect on their terrace-modified shape.
      for (const s of [3, 4]) {
        const off = resOff.storyPolygons.find((p) => p.storyIndex === s);
        const on = resOn.storyPolygons.find((p) => p.storyIndex === s);
        expect(off).toBeDefined();
        expect(on).toBeDefined();
        expect(on!.polygon.length).toBe(off!.polygon.length);
        expect(area(on!.polygon)).toBeCloseTo(area(off!.polygon), 3);
      }

      // Story 2 (split by gate into 2 wings): exactly one wing must carry the terrace reduction
      // relative to the gate-only shape; the other wing (owning a different wall than edgeIndex:7)
      // must stay exactly as gate alone would produce it.
      const story2Wings = resOn.storyPolygons.filter((p) => p.storyIndex === 2);
      expect(story2Wings.length).toBe(2);

      const gateOnlyRes = gateOnly(gateEnabled);
      const gateOnlyStory2Wings = gateOnlyRes.storyPolygons.filter((p) => p.storyIndex === 2);
      expect(gateOnlyStory2Wings.length).toBe(2);

      const gateOnlyAreas = sortedAreas(gateOnlyStory2Wings);
      const afterTerraceAreas = sortedAreas(story2Wings);
      const diffs = [0, 1].map((i) => Math.abs(afterTerraceAreas[i] - gateOnlyAreas[i]));
      expect(diffs.filter((d) => d > 1e-3).length).toBe(1);
      }
    );

    // mod-test5.json: Budynek1A and Budynek1B each carry ONE gate modifier on their own
    // building (used here purely as stabilization anchors: their own single-gate geometry
    // must stay identical across this fix). Budynek1 is the same octagon with BOTH gate
    // modifiers (from A and B) composed onto one building — reproduces the reported bug
    // where a second `gate`, run after the first has already split the story into wings,
    // was applied to EVERY wing (raw local edgeIndex, no ownership check) instead of only
    // the wing that geometrically owns the wall it targets, producing an extra/erroneous cutout.
    const onlyModifierById = (building: BuildingLoop, id: string): BuildingLoop => ({
      ...building,
      modifiers: building.modifiers!.filter((m) => m.id === id),
    });

    // Detects the degenerate "sliver" artifact reported live: a boolean-op result containing two
    // consecutive vertices closer than a real geometric feature ever would be (observed: ~5mm).
    const hasNearDuplicateConsecutiveVertex = (polygon: Point2D[], tol = 1e-2): boolean => {
      const n = polygon.length;
      for (let i = 0; i < n; i++) {
        const p = polygon[i];
        const q = polygon[(i + 1) % n];
        if (Math.hypot(q.x - p.x, q.y - p.y) < tol) return true;
      }
      return false;
    };

    const assertNoDegenerateGeometry = (res: ReturnType<typeof applyBuildingModifiers>) => {
      for (const sf of res.storyPolygons) {
        expect(hasNearDuplicateConsecutiveVertex(sf.polygon)).toBe(false);
      }
      for (const seg of res.segments) {
        expect(seg.length).toBeGreaterThan(1e-2);
      }
    };

    it.skipIf(!referenceFileExists('mod-test5.json'))(
      'mod-test5.json: Budynek1A gate geometry is stable (stabilization anchor)',
      () => {
        const building = loadReferenceBuilding('mod-test5.json', 'Budynek1A');
        const res = applyBuildingModifiers(building);

        const story0Wings = res.storyPolygons.filter((s) => s.storyIndex === 0);
        const story1Wings = res.storyPolygons.filter((s) => s.storyIndex === 1);
        // Gate modifier in mod-test5.json has storiesCount: 2 (ground floor and 1st floor)
        expect(story0Wings.length).toBe(2);
        expect(story1Wings.length).toBe(2);
        assertNoDegenerateGeometry(res);
      }
    );

    it.skipIf(!referenceFileExists('mod-test5.json'))(
      'mod-test5.json: Budynek1B gate geometry is stable (stabilization anchor)',
      () => {
        const building = loadReferenceBuilding('mod-test5.json', 'Budynek1B');
        const res = applyBuildingModifiers(building);

        const story0Wings = res.storyPolygons.filter((s) => s.storyIndex === 0);
        const story1Wings = res.storyPolygons.filter((s) => s.storyIndex === 1);
        expect(story0Wings.length).toBe(2);
        expect(story1Wings.length).toBe(2);
        assertNoDegenerateGeometry(res);
      }
    );

    it.skipIf(!referenceFileExists('mod-test5.json'))(
      'mod-test5.json: Budynek1A gate + second gate composed must not produce an extra/erroneous cutout or a degenerate sliver fragment',
      () => {
        const bldg1A = loadReferenceBuilding('mod-test5.json', 'Budynek1A');
        const gate2: Modifier = {
          id: 'mod-gate-second',
          type: 'gate',
          enabled: true,
          width: 4,
          storiesCount: 1,
          positionRatio: 0.5,
          edgeIndex: 1,
        };
        const building: BuildingLoop = {
          ...bldg1A,
          name: 'Budynek1',
          modifiers: [bldg1A.modifiers![0], gate2],
        };
        expect(building.modifiers!.length).toBe(2);

        const res1Only = applyBuildingModifiers(onlyModifierById(building, bldg1A.modifiers![0].id));
        const res2Only = applyBuildingModifiers(onlyModifierById(building, gate2.id));
        const resBoth = applyBuildingModifiers(building);

        assertNoDegenerateGeometry(resBoth);

        for (const storyIndex of [0]) {
          const wings1Only = res1Only.storyPolygons.filter((s) => s.storyIndex === storyIndex);
          const wings2Only = res2Only.storyPolygons.filter((s) => s.storyIndex === storyIndex);
          const wingsBoth = resBoth.storyPolygons.filter((s) => s.storyIndex === storyIndex);
          expect(wings1Only.length).toBe(2);
          expect(wings2Only.length).toBe(2);
          expect(wingsBoth.length).toBe(3);

          const areas1Only = sortedAreas(wings1Only);
          const areasBoth = sortedAreas(wingsBoth);
          const unchangedCount = areas1Only.filter((a1) =>
            areasBoth.some((ab) => Math.abs(ab - a1) < 1e-3)
          ).length;
          expect(unchangedCount).toBe(1);
        }
      }
    );
  });

  describe('Modifier: Sztyca (Vertical extension / additional storeys on roof)', () => {
    it('adds 2 extra storeys on top of base 5 storeys, updating elevation to 21m', () => {
      const bldgSztyca: BuildingLoop = {
        ...baseBuilding,
        modifiers: [
          {
            id: 'mod-sztyca-1',
            type: 'sztyca',
            enabled: true,
            storiesCount: 2,
            storeyHeight: 3.0,
            offset: 0.0,
          },
        ],
      };

      const res = applyBuildingModifiers(bldgSztyca);
      expect(res.storyPolygons.length).toBe(7); // 5 base + 2 extra
      expect(res.storyPolygons[5].hBottom).toBe(15.0);
      expect(res.storyPolygons[5].hTop).toBe(18.0);
      expect(res.storyPolygons[6].hBottom).toBe(18.0);
      expect(res.storyPolygons[6].hTop).toBe(21.0);

      const topSegs = res.segments.filter((s) => s.hTop === 21.0);
      expect(topSegs.length).toBeGreaterThan(0);
    });

    it('adds a set-back spire with offset -1.0m on top', () => {
      const bldgSztycaSetback: BuildingLoop = {
        ...baseBuilding,
        modifiers: [
          {
            id: 'mod-sztyca-2',
            type: 'sztyca',
            enabled: true,
            storiesCount: 1,
            storeyHeight: 4.0,
            offset: -1.0,
          },
        ],
      };

      const res = applyBuildingModifiers(bldgSztycaSetback);
      expect(res.storyPolygons.length).toBe(6);
      const topStory = res.storyPolygons[5];
      expect(topStory.hBottom).toBe(15.0);
      expect(topStory.hTop).toBe(19.0);
      expect(topStory.polygon).toEqual([
        { x: 1, y: 1 },
        { x: 9, y: 1 },
        { x: 9, y: 9 },
        { x: 1, y: 9 },
      ]);
    });
  });

  describe('Modifier: Pila (Analytical Sawtooth / Edge Step Notches b-a-b-a)', () => {
    it('generates 1 step (2 subsegments b-a) along edge of length 10m connecting P1 and P2 exactly', () => {
      const pts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const poly = generatePilaPolygon(pts, 1, 0, 90, 'prev_edge');
      expect(poly.length).toBe(5);
      expect(poly.some((p) => Math.abs(p.x) < 0.01 && Math.abs(p.y - 10) < 0.01)).toBe(true);
      expect(poly.some((p) => Math.abs(p.x - 10) < 0.01 && Math.abs(p.y - 10) < 0.01)).toBe(true);
      expect(poly.some((p) => Math.abs(p.x - 10) < 0.01 && Math.abs(p.y) < 0.01)).toBe(true);
    });

    it('generates 2 steps (4 subsegments b-a-b-a) along edge of length 30m', () => {
      const pts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 0, y: 10 },
      ];

      const poly = generatePilaPolygon(pts, 2, 0, 90, 'prev_edge');
      expect(poly.length).toBe(7);
      expect(poly.some((p) => Math.abs(p.x - 30) < 0.01 && Math.abs(p.y) < 0.01)).toBe(true);
    });

    it('calculates metrics for 90, 120, 135, and 150 degree angles', () => {
      const pts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 0, y: 10 },
      ];

      const m90 = calculatePilaMetrics(pts, 1, 0, 90, 'prev_edge');
      expect(m90).not.toBeNull();
      expect(m90!.totalSubsegments).toBe(2);
      expect(m90!.edgeLen).toBe(20);

      const m120 = calculatePilaMetrics(pts, 1, 0, 120, 'prev_edge');
      expect(m120).not.toBeNull();
      expect(m120!.angle).toBe(120);

      const m135 = calculatePilaMetrics(pts, 1, 0, 135, 'prev_edge');
      expect(m135).not.toBeNull();
      expect(m135!.angle).toBe(135);

      const m150 = calculatePilaMetrics(pts, 1, 0, 150, 'prev_edge');
      expect(m150).not.toBeNull();
      expect(m150!.angle).toBe(150);
    });

    it('supports prev_edge and next_edge alignment modes', () => {
      const pts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 0, y: 10 },
      ];

      const poly135 = generatePilaPolygon(pts, 1, 0, 135, 'prev_edge');
      expect(poly135.length).toBeGreaterThanOrEqual(4);
      expect(poly135.some((p) => Math.abs(p.x - 20) < 0.01 && Math.abs(p.y) < 0.01)).toBe(true);

      const m135 = calculatePilaMetrics(pts, 1, 0, 135, 'prev_edge');
      expect(m135).not.toBeNull();
      expect(m135!.lenA).toBeGreaterThan(0);
      expect(m135!.lenB).toBeGreaterThan(0);

      const polyNext = generatePilaPolygon(pts, 1, 0, 90, 'next_edge');
      expect(polyNext.length).toBeGreaterThanOrEqual(4);
      expect(polyNext.some((p) => Math.abs(p.x - 20) < 0.01)).toBe(true);
    });

    // `reference/pila2.dxf` is gitignored (local scratch fixture): hand-drawn "source" (layer
    // `source`) vs. correct "expected" (layer `0`) polygon pairs for the sawtooth modifier.
    // Regression coverage for the bug where cleanPolygonRing's collinear-point removal was
    // silently deleting original outline corners whenever a tooth's last segment happened to
    // land on the same line as the adjacent untouched edge.
    describe('reference/pila2.dxf: reproduces hand-verified sawtooth outlines exactly', () => {
      const dxfPath = path.resolve(__dirname, '../../../reference/pila2.dxf');
      const dxfExists = fs.existsSync(dxfPath);

      const parseDxfPolylines = (): { layer: string; pts: Point2D[] }[] => {
        const lines = fs.readFileSync(dxfPath, 'utf-8').split(/\r?\n/);
        const entities: { layer: string; pts: Point2D[] }[] = [];
        let inEntities = false;
        let i = 0;
        while (i < lines.length) {
          const code = lines[i]?.trim();
          const val = lines[i + 1]?.trim() ?? '';
          if (code === '2' && val === 'ENTITIES') inEntities = true;
          if (inEntities && code === '0' && val === 'LWPOLYLINE') {
            let j = i + 2;
            let layer = '';
            const pts: Point2D[] = [];
            let cur: Partial<Point2D> = {};
            while (j < lines.length && lines[j].trim() !== '0') {
              const c = lines[j].trim();
              const v = lines[j + 1]?.trim() ?? '';
              if (c === '8') layer = v;
              if (c === '10') {
                if (cur.x !== undefined) { pts.push(cur as Point2D); cur = {}; }
                cur.x = parseFloat(v);
              }
              if (c === '20') cur.y = parseFloat(v);
              j += 2;
            }
            if (cur.x !== undefined) pts.push(cur as Point2D);
            entities.push({ layer, pts });
            i = j;
            continue;
          }
          if (inEntities && code === '0' && val === 'ENDSEC') break;
          i += 2;
        }
        return entities;
      };

      // Cyclic, direction-agnostic point-set comparison (result may start at a different vertex).
      const expectSameRing = (actual: Point2D[], expected: Point2D[]) => {
        expect(actual.length).toBe(expected.length);
        const n = actual.length;
        let best = Infinity;
        for (const candidate of [actual, [...actual].reverse()]) {
          for (let r = 0; r < n; r++) {
            let err = 0;
            for (let k = 0; k < n; k++) {
              const p = candidate[(k + r) % n];
              const q = expected[k];
              err += Math.hypot(p.x - q.x, p.y - q.y);
            }
            best = Math.min(best, err);
          }
        }
        expect(best).toBeLessThan(0.01);
      };

      it.skipIf(!dxfExists)('trapezoid A, edge 1, next_edge/90°/3 teeth matches expected outline', () => {
        const entities = parseDxfPolylines();
        const sourceA = entities.filter((e) => e.layer === 'source')[0].pts;
        const expectedA1 = entities.filter((e) => e.layer === '0' && e.pts.length === 9)[0].pts;
        const out = generatePilaPolygon(sourceA, 3, 1, 90, 'next_edge');
        expectSameRing(out, expectedA1);
      });

      it.skipIf(!dxfExists)('trapezoid B, edge 1, next_edge/90°/5 teeth matches expected outline', () => {
        const entities = parseDxfPolylines();
        const sourceB = entities.filter((e) => e.layer === 'source')[1].pts;
        const expectedB1 = entities.filter((e) => e.layer === '0' && e.pts.length === 13)[0].pts;
        const out = generatePilaPolygon(sourceB, 5, 1, 90, 'next_edge');
        expectSameRing(out, expectedB1);
      });

      it.skipIf(!dxfExists)('quad C, edge 3, prev_edge and next_edge/90°/4 teeth match expected outlines', () => {
        const entities = parseDxfPolylines();
        const sourceC = entities.filter((e) => e.layer === 'source')[2].pts;
        const resultsC = entities.filter((e) => e.layer === '0' && e.pts.length === 11);
        const outPrev = generatePilaPolygon(sourceC, 4, 3, 90, 'prev_edge');
        const outNext = generatePilaPolygon(sourceC, 4, 3, 90, 'next_edge');
        // One of the two alignment modes should match each of the two hand-drawn variants.
        expectSameRing(outPrev, resultsC[0].pts);
        expectSameRing(outNext, resultsC[1].pts);
      });
    });

    // `reference/pila3.dxf` is gitignored (local scratch fixture), same source/`0`-layer pairing
    // convention as pila2.dxf above. Regression coverage for the bug where computeStepVectors'
    // candidate search for `prev_edge`/`next_edge` alignment only tried directions parallel/
    // antiparallel to the adjacent wall - never perpendicular to it - so it silently fell back to
    // a wrong shape whenever the correct tooth base direction was the perpendicular one.
    describe('reference/pila3.dxf: reproduces hand-verified sawtooth outlines exactly', () => {
      const dxfPath = path.resolve(__dirname, '../../../reference/pila3.dxf');
      const dxfExists = fs.existsSync(dxfPath);

      const parseDxfPolylines = (): { layer: string; pts: Point2D[] }[] => {
        const lines = fs.readFileSync(dxfPath, 'utf-8').split(/\r?\n/);
        const entities: { layer: string; pts: Point2D[] }[] = [];
        let inEntities = false;
        let i = 0;
        while (i < lines.length) {
          const code = lines[i]?.trim();
          const val = lines[i + 1]?.trim() ?? '';
          if (code === '2' && val === 'ENTITIES') inEntities = true;
          if (inEntities && code === '0' && val === 'LWPOLYLINE') {
            let j = i + 2;
            let layer = '';
            const pts: Point2D[] = [];
            let cur: Partial<Point2D> = {};
            while (j < lines.length && lines[j].trim() !== '0') {
              const c = lines[j].trim();
              const v = lines[j + 1]?.trim() ?? '';
              if (c === '8') layer = v;
              if (c === '10') {
                if (cur.x !== undefined) { pts.push(cur as Point2D); cur = {}; }
                cur.x = parseFloat(v);
              }
              if (c === '20') cur.y = parseFloat(v);
              j += 2;
            }
            if (cur.x !== undefined) pts.push(cur as Point2D);
            entities.push({ layer, pts });
            i = j;
            continue;
          }
          if (inEntities && code === '0' && val === 'ENDSEC') break;
          i += 2;
        }
        return entities;
      };

      const expectSameRing = (actual: Point2D[], expected: Point2D[]) => {
        expect(actual.length).toBe(expected.length);
        const n = actual.length;
        let best = Infinity;
        for (const candidate of [actual, [...actual].reverse()]) {
          for (let r = 0; r < n; r++) {
            let err = 0;
            for (let k = 0; k < n; k++) {
              const p = candidate[(k + r) % n];
              const q = expected[k];
              err += Math.hypot(p.x - q.x, p.y - q.y);
            }
            best = Math.min(best, err);
          }
        }
        expect(best).toBeLessThan(0.01);
      };

      it.skipIf(!dxfExists)(
        'quad F, edge 1, prev_edge/120°/2 teeth matches expected outline (tooth base perpendicular to adjacent wall)',
        () => {
          const entities = parseDxfPolylines();
          const sourceF = entities.filter((e) => e.layer === 'source')[0].pts;
          const expectedF1 = entities.filter((e) => e.layer === '0' && e.pts.length === 7)[0].pts;
          const out = generatePilaPolygon(sourceF, 2, 1, 120, 'prev_edge');
          expectSameRing(out, expectedF1);
        }
      );

      // Known open gap (not fixed by this change): quad G's two `0`-layer variants need a tooth
      // base rotated by (180°-toothAngle)/2 from the adjacent wall - a *different* extra
      // candidate direction than quad F's. Adding it alongside the perpendicular candidate makes
      // the existing scoring heuristic ambiguous between two mirror-valid solutions and regresses
      // quad C's previously-exact case. Left unresolved pending more reference data at other
      // toothAngle values to disambiguate the tie-break rule.
      it.skip('quad G: needs an alpha-rotated tooth-base candidate not yet implemented', () => {});
    });

    it('applies Pila modifier within applyBuildingModifiers to specific story', () => {
      const bldgPila: BuildingLoop = {
        ...baseBuilding,
        modifiers: [
          {
            id: 'mod-pila-1',
            type: 'pila',
            enabled: true,
            teethCount: 1, // b-a
            toothAngle: 90,
            alignment: 'prev_edge',
            storiesCount: 1, // parter tylko
            edgeIndex: 0,
          },
        ],
      };

      const res = applyBuildingModifiers(bldgPila);
      expect(res.storyPolygons[0].polygon.length).toBe(5); // ground modified
      expect(res.storyPolygons[1].polygon.length).toBe(4); // upper unmodified
    });

    it('reproduces reference mod-test6.json: Budynek1A matches Budynek1B', () => {
      const bldg1A: BuildingLoop = {
        id: 'bldg-1789415044958-wyxm',
        name: 'Budynek1A',
        layer: 'BUD_NOWY',
        isTested: false,
        category: 'building',
        elevation: 0,
        firstFloorHeight: 3,
        typicalFloorHeight: 3,
        storeysCount: 5,
        isIncluded: true,
        isCityCentre: false,
        buildingType: 'residential',
        defaultHeight: 15,
        heightSource: 'default',
        hWindowBottom: 0.85,
        isClockwise: true,
        transform: { tx: 0, ty: 0, rotationDeg: 0 },
        vertices: [
          { x: -70.02942662591025, y: -6.796457014023964 },
          { x: -27.783087987846997, y: 8.823708291050089 },
          { x: 14.029883576300215, y: -6.796457014023964 },
          { x: -5.325878641314048, y: -67.99753374019468 },
          { x: -70.02942662591025, y: -67.99753374019468 },
        ],
        segments: [],
        modifiers: [
          {
            id: 'mod-pila-1789415022011-yttu',
            type: 'pila',
            enabled: true,
            teethCount: 3,
            toothAngle: 90,
            alignment: 'next_edge',
            storiesCount: 0,
            edgeIndex: 2,
          },
        ],
      };

      const res = applyBuildingModifiers(bldg1A);
      expect(res.storyPolygons.length).toBe(5);

      const poly1A = res.storyPolygons[0].polygon;
      expect(poly1A.length).toBeGreaterThanOrEqual(9);

      // Expected reference offset between Budynek1A and Budynek1B
      const dY = 101.772206555064;

      // Budynek1B target vertices
      const bldg1BVertices: Point2D[] = [
        { x: -70.02942662591025, y: 33.77467281486927 },
        { x: -5.325878641314079, y: 33.77467281486927 },
        { x: 1.1260420978906538, y: 33.77467281486927 },
        { x: 1.123554784240536, y: 54.167167074718165 },
        { x: 7.577962837095402, y: 54.175031723592824 },
        { x: 7.572988209795152, y: 74.55966133456707 },
        { x: 14.029883576300156, y: 74.57539063231641 },
        { x: 14.02988357630017, y: 94.97574954104002 },
        { x: -27.78308798784703, y: 110.59591484611408 },
        { x: -70.02942662591025, y: 94.97574954104002 },
      ];

      // Translated 1A should match 1B corners
      const nonCollinear1B = bldg1BVertices.filter((pt) => Math.abs(pt.x - (-5.325878641314079)) > 0.01);
      for (const ptB of nonCollinear1B) {
        const match = poly1A.some((ptA) => Math.hypot(ptA.x - ptB.x, (ptA.y + dY) - ptB.y) < 0.1);
        expect(match).toBe(true);
      }
    });
  });

  describe('Modifier: Zone Function (BuildingType per storey and per edge offset)', () => {
    it('sets buildingType: service on ground floor (scope: storeys)', () => {
      const bldgZoneFunc: BuildingLoop = {
        ...baseBuilding,
        buildingType: 'residential',
        modifiers: [
          {
            id: 'mod-zfunc-1',
            type: 'zone_function',
            enabled: true,
            buildingType: 'service',
            scope: 'storeys',
            storiesCount: 1, // parter (+1)
          },
        ],
      };

      const res = applyBuildingModifiers(bldgZoneFunc);
      expect(res.storyPolygons[0].buildingType).toBe('service');
      expect(res.storyPolygons[1].buildingType).toBe('residential');

      // Check facade segments
      const groundSegs = res.segments.filter((s) => s.hBase === 0 && s.hTop === 3.5);
      expect(groundSegs.length).toBe(4);
      for (const seg of groundSegs) {
        expect(seg.buildingType).toBe('service');
      }

      const upperSegs = res.segments.filter((s) => s.hBase === 3.5 && s.hTop === 15.0);
      expect(upperSegs.length).toBe(4);
      for (const seg of upperSegs) {
        expect(seg.buildingType).toBe('residential');
      }
    });

    it('splits footprint into 2 discrete StoryFootprint zones along edge offset', () => {
      const bldgZoneOffset: BuildingLoop = {
        ...baseBuilding,
        buildingType: 'residential',
        modifiers: [
          {
            id: 'mod-zfunc-2',
            type: 'zone_function',
            enabled: true,
            buildingType: 'garage',
            scope: 'edge_offset',
            storiesCount: 0, // cała bryła
            edgeIndex: 0,
            depth: 4.0, // 4m pasmo od krawędzi 0 (y: 0..4)
          },
        ],
      };

      const res = applyBuildingModifiers(bldgZoneOffset);
      // Each of the 5 storeys is split into 2 footprints (1 garage + 1 residential)
      expect(res.storyPolygons.length).toBe(10);

      const garageFootprints = res.storyPolygons.filter((s) => s.buildingType === 'garage');
      const resFootprints = res.storyPolygons.filter((s) => s.buildingType === 'residential');
      expect(garageFootprints.length).toBe(5);
      expect(resFootprints.length).toBe(5);

      // Verify 3D solids produce distinct elements with their respective buildingType
      const solids = getBuildingSolids({ ...bldgZoneOffset, storyPolygons: res.storyPolygons });
      expect(solids.length).toBe(10);
      expect(solids.filter((s) => s.buildingType === 'garage').length).toBe(5);
      expect(solids.filter((s) => s.buildingType === 'residential').length).toBe(5);
    });
  });

  describe('Rotation stability for building modifiers', () => {
    function rotatePoint(pt: Point2D, angleRad: number, center: Point2D = { x: 10, y: 10 }): Point2D {
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      const dx = pt.x - center.x;
      const dy = pt.y - center.y;
      return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos,
      };
    }

    function rotateBuilding(building: BuildingLoop, angleDeg: number): BuildingLoop {
      const rad = (angleDeg * Math.PI) / 180;
      return {
        ...building,
        vertices: building.vertices.map((v) => rotatePoint(v, rad)),
      };
    }

    function polygonsMatchAfterUnrotate(
      polyRotated: Point2D[],
      polyOriginal: Point2D[],
      angleDeg: number
    ): boolean {
      const rad = (-angleDeg * Math.PI) / 180;
      const unrotated = polyRotated.map((v) => rotatePoint(v, rad));
      if (unrotated.length !== polyOriginal.length) return false;
      const area1 = Math.abs(calculateSignedArea(unrotated));
      const area2 = Math.abs(calculateSignedArea(polyOriginal));
      if (Math.abs(area1 - area2) > 0.05) return false;
      for (const pt1 of unrotated) {
        const found = polyOriginal.some(
          (pt2) => Math.hypot(pt1.x - pt2.x, pt1.y - pt2.y) < 0.1
        );
        if (!found) return false;
      }
      return true;
    }

    const testAngles = [0, 45, 90, 135, 180, 270];

    it('maintains terrace modifier on edge 1 across all rotation angles', () => {
      const bldg: BuildingLoop = {
        ...baseBuilding,
        modifiers: [
          {
            id: 'mod-terrace-rot',
            type: 'terrace',
            enabled: true,
            depth: -4,
            edgeIndex: 1,
            storiesCount: -1,
            variant: 'drop',
          },
        ],
      };
      const origRes = applyBuildingModifiers(bldg);

      for (const angle of testAngles) {
        const rotBldg = rotateBuilding(bldg, angle);
        const rotRes = applyBuildingModifiers(rotBldg);

        expect(rotRes.storyPolygons.length).toBe(origRes.storyPolygons.length);
        for (let i = 0; i < origRes.storyPolygons.length; i++) {
          expect(
            polygonsMatchAfterUnrotate(
              rotRes.storyPolygons[i].polygon,
              origRes.storyPolygons[i].polygon,
              angle
            )
          ).toBe(true);
        }
      }
    });

    it('maintains bay window modifier on edge 1 across all rotation angles', () => {
      const bldg: BuildingLoop = {
        ...baseBuilding,
        modifiers: [
          {
            id: 'mod-bay-rot',
            type: 'bay_window',
            enabled: true,
            edgeIndex: 1,
            width: 6,
            projection: 2,
            positionRatio: 0.5,
            storiesCount: 0,
            sideAngle: 90,
          },
        ],
      };
      const origRes = applyBuildingModifiers(bldg);

      for (const angle of testAngles) {
        const rotBldg = rotateBuilding(bldg, angle);
        const rotRes = applyBuildingModifiers(rotBldg);

        expect(rotRes.storyPolygons.length).toBe(origRes.storyPolygons.length);
        for (let i = 0; i < origRes.storyPolygons.length; i++) {
          expect(
            polygonsMatchAfterUnrotate(
              rotRes.storyPolygons[i].polygon,
              origRes.storyPolygons[i].polygon,
              angle
            )
          ).toBe(true);
        }
      }
    });

    it('maintains gate modifier on edge 0 across all rotation angles', () => {
      const bldg: BuildingLoop = {
        ...baseBuilding,
        modifiers: [
          {
            id: 'mod-gate-rot',
            type: 'gate',
            enabled: true,
            edgeIndex: 0,
            width: 4,
            positionRatio: 0.5,
            storiesCount: 1,
          },
        ],
      };
      const origRes = applyBuildingModifiers(bldg);

      for (const angle of testAngles) {
        const rotBldg = rotateBuilding(bldg, angle);
        const rotRes = applyBuildingModifiers(rotBldg);

        const origStory0 = origRes.storyPolygons.filter((s) => s.storyIndex === 0);
        const rotStory0 = rotRes.storyPolygons.filter((s) => s.storyIndex === 0);
        expect(rotStory0.length).toBe(origStory0.length);

        for (const origWing of origStory0) {
          const match = rotStory0.some((rw) =>
            polygonsMatchAfterUnrotate(rw.polygon, origWing.polygon, angle)
          );
          expect(match).toBe(true);
        }
      }
    });

    it('maintains pila modifier on edge 1 across all rotation angles', () => {
      const bldg: BuildingLoop = {
        ...baseBuilding,
        modifiers: [
          {
            id: 'mod-pila-rot',
            type: 'pila',
            enabled: true,
            edgeIndex: 1,
            teethCount: 2,
            toothAngle: 90,
            alignment: 'perpendicular',
            storiesCount: 0,
          },
        ],
      };
      const origRes = applyBuildingModifiers(bldg);

      for (const angle of testAngles) {
        const rotBldg = rotateBuilding(bldg, angle);
        const rotRes = applyBuildingModifiers(rotBldg);

        expect(rotRes.storyPolygons.length).toBe(origRes.storyPolygons.length);
        for (let i = 0; i < origRes.storyPolygons.length; i++) {
          expect(
            polygonsMatchAfterUnrotate(
              rotRes.storyPolygons[i].polygon,
              origRes.storyPolygons[i].polygon,
              angle
            )
          ).toBe(true);
        }
      }
    });

    it('maintains corner cut modifier on vertex 1 across all rotation angles', () => {
      const bldg: BuildingLoop = {
        ...baseBuilding,
        modifiers: [
          {
            id: 'mod-corner-rot',
            type: 'corner_cut',
            enabled: true,
            vertexIndex: 1,
            scope: 'vertex',
            mode: 'chamfer',
            depth: 3,
            storiesCount: 0,
          },
        ],
      };
      const origRes = applyBuildingModifiers(bldg);

      for (const angle of testAngles) {
        const rotBldg = rotateBuilding(bldg, angle);
        const rotRes = applyBuildingModifiers(rotBldg);

        expect(rotRes.storyPolygons.length).toBe(origRes.storyPolygons.length);
        for (let i = 0; i < origRes.storyPolygons.length; i++) {
          expect(
            polygonsMatchAfterUnrotate(
              rotRes.storyPolygons[i].polygon,
              origRes.storyPolygons[i].polygon,
              angle
            )
          ).toBe(true);
        }
      }
    });

    it('maintains donut + courtyard hole terrace modifier across all rotation angles', () => {
      const bldg: BuildingLoop = {
        ...baseBuilding,
        vertices: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 40 },
          { x: 0, y: 40 },
        ],
        modifiers: [
          {
            id: 'mod-donut-rot',
            type: 'donut',
            enabled: true,
            offset: -10,
            storiesCount: 0,
          },
          {
            id: 'mod-terrace-hole-rot',
            type: 'terrace',
            enabled: true,
            edgeIndex: 4, // targeting courtyard hole edge
            depth: -2,
            storiesCount: -1,
            variant: 'drop',
          },
        ],
      };
      const origRes = applyBuildingModifiers(bldg);

      for (const angle of testAngles) {
        const rotBldg = rotateBuilding(bldg, angle);
        const rotRes = applyBuildingModifiers(rotBldg);

        expect(rotRes.storyPolygons.length).toBe(origRes.storyPolygons.length);
        for (let i = 0; i < origRes.storyPolygons.length; i++) {
          // Check outer polygon
          expect(
            polygonsMatchAfterUnrotate(
              rotRes.storyPolygons[i].polygon,
              origRes.storyPolygons[i].polygon,
              angle
            )
          ).toBe(true);

          // Check holes
          if (origRes.storyPolygons[i].holes && origRes.storyPolygons[i].holes!.length > 0) {
            expect(rotRes.storyPolygons[i].holes!.length).toBe(origRes.storyPolygons[i].holes!.length);
            for (let h = 0; h < origRes.storyPolygons[i].holes!.length; h++) {
              expect(
                polygonsMatchAfterUnrotate(
                  rotRes.storyPolygons[i].holes![h],
                  origRes.storyPolygons[i].holes![h],
                  angle
                )
              ).toBe(true);
            }
          }
        }
      }
    });

    it('maintains identical relative geometry across all translation offsets in the scene', () => {
      const modifiersToTest: Modifier[] = [
        { id: 'm1', type: 'story_offset', enabled: true, distance: -2, storiesCount: -1 },
        { id: 'm2', type: 'bay_window', enabled: true, width: 4, projection: 1.5, storiesCount: 0, edgeIndex: 1 },
        { id: 'm3', type: 'terrace', enabled: true, depth: -4, storiesCount: -1, edgeIndex: 1 },
        { id: 'm4', type: 'donut', enabled: true, offset: -10, storiesCount: 0 },
        { id: 'm5', type: 'corner_cut', enabled: true, depth: 2, storiesCount: 0, mode: 'chamfer', scope: 'vertex', vertexIndex: 1 },
        { id: 'm6', type: 'gate', enabled: true, width: 4, storiesCount: 1, positionRatio: 0.5, edgeIndex: 0 },
        { id: 'm7', type: 'sztyca', enabled: true, storiesCount: 1, storeyHeight: 3, offset: -1 },
        { id: 'm8', type: 'pila', enabled: true, teethCount: 2, storiesCount: 0, edgeIndex: 1, toothAngle: 90, alignment: 'prev_edge' },
      ];

      const testOffsets = [
        { dx: 10, dy: 20 },
        { dx: -50, dy: 75 },
        { dx: 123.456, dy: 789.012 },
        { dx: 5000, dy: -3000 },
      ];

      for (const mod of modifiersToTest) {
        const base: BuildingLoop = {
          ...baseBuilding,
          vertices: [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 30 },
            { x: 0, y: 30 },
          ],
          modifiers: [mod],
        };

        const resOrigin = applyBuildingModifiers(base);

        for (const { dx, dy } of testOffsets) {
          const movedBldg: BuildingLoop = {
            ...base,
            vertices: base.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy })),
          };

          const resMoved = applyBuildingModifiers(movedBldg);

          expect(resMoved.storyPolygons.length).toBe(resOrigin.storyPolygons.length);

          for (let s = 0; s < resOrigin.storyPolygons.length; s++) {
            const origSp = resOrigin.storyPolygons[s];
            const movedSp = resMoved.storyPolygons[s];

            expect(movedSp.polygon.length).toBe(origSp.polygon.length);

            // Sprawdź czy każdy wierzchołek po odjęciu (dx, dy) zgadza się z origSp
            // (z uwzględnieniem ewentualnego cyklicznego przesunięcia indeksu)
            const n = origSp.polygon.length;
            let bestOffset = -1;
            for (let shift = 0; shift < n; shift++) {
              let allMatch = true;
              for (let i = 0; i < n; i++) {
                const pMoved = movedSp.polygon[(i + shift) % n];
                const pOrig = origSp.polygon[i];
                if (
                  Math.abs(pMoved.x - dx - pOrig.x) > 0.05 ||
                  Math.abs(pMoved.y - dy - pOrig.y) > 0.05
                ) {
                  allMatch = false;
                  break;
                }
              }
              if (allMatch) {
                bestOffset = shift;
                break;
              }
            }

            expect(
              bestOffset !== -1,
              `Modifier ${mod.type} failed translation test at offset (${dx}, ${dy}) on story ${s}`
            ).toBe(true);
          }
        }
      }
    });
  });
});

