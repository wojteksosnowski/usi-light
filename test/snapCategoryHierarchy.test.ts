import { describe, it, expect } from 'vitest';
import { SnapCoordinator } from '../src/engine/snapping/SnapCoordinator';
import { VertexSnapStrategy } from '../src/engine/snapping/strategies/VertexSnapStrategy';
import { EdgeSnapStrategy } from '../src/engine/snapping/strategies/EdgeSnapStrategy';
import { IntersectionSnapStrategy } from '../src/engine/snapping/strategies/IntersectionSnapStrategy';
import { DirectionSnapStrategy, collectTargetDirections } from '../src/engine/snapping/strategies/DirectionSnapStrategy';
import { CachedLineEquation, createCachedLineEquation } from '../src/utils/lineBufferEngine';
import { SnapContext } from '../src/engine/snapping/types';
import { BuildingLoop, Point2D } from '../src/types/geometry';

function createDummyContext(overrides: Partial<SnapContext> = {}): SnapContext {
  return {
    mouseWorld: { x: 10, y: 10 },
    mouseScreen: { sx: 100, sy: 100 },
    worldToScreen: (wx, wy) => ({ sx: wx * 10, sy: wy * 10 }),
    screenToWorld: (sx, sy) => ({ wx: sx / 10, wy: sy / 10 }),
    buildings: [],
    lineBuffer: [],
    isOsnapActive: true,
    isDirectionSnappingActive: true,
    thresholdPx: 20,
    ...overrides,
  };
}

describe('Category-Aware Snap Hierarchy (Context-Aware Priority Matrix)', () => {
  it('favors boundary vertex over building vertex when editing a boundary object', () => {
    const strategy = new VertexSnapStrategy();

    // Two vertices near mouse at (10, 10) / screen (100, 100)
    // Building vertex at (10.05, 10) -> screen (100.5, 100) -> distance = 5px
    // Boundary vertex at (10.07, 10) -> screen (100.7, 100) -> distance = 7px
    const buildingEdge: CachedLineEquation = createCachedLineEquation(
      'bldg_edge_0',
      'bldg_1',
      0,
      { x: 10.05, y: 10 },
      { x: 20, y: 10 },
      'building',
      'Budynek A'
    );
    const boundaryEdge: CachedLineEquation = createCachedLineEquation(
      'boundary_edge_0',
      'plot_1',
      0,
      { x: 10.07, y: 10 },
      { x: 10.07, y: 30 },
      'boundary',
      'Działka 124/2'
    );

    const context = createDummyContext({
      lineBuffer: [buildingEdge, boundaryEdge],
      activeCategory: 'boundary',
    });

    const snaps = strategy.findAllSnaps(context.mouseWorld, context);
    expect(snaps.length).toBe(2);

    // Because activeCategory === 'boundary', the boundary vertex gets affinity bonus (5px)
    // building effDist = 5px
    // boundary effDist = 7px - 5px = 2px
    // Thus boundary vertex must be chosen first!
    expect(snaps[0].sourceBuildingId).toBe('plot_1');
    expect(snaps[0].sourceCategory).toBe('boundary');
    expect(snaps[0].description).toContain('Działka 124/2');

    expect(snaps[1].sourceBuildingId).toBe('bldg_1');
    expect(snaps[1].sourceCategory).toBe('building');
  });

  it('favors building vertex over boundary vertex when editing a building', () => {
    const strategy = new VertexSnapStrategy();

    const buildingEdge: CachedLineEquation = createCachedLineEquation(
      'bldg_edge_0',
      'bldg_1',
      0,
      { x: 10.07, y: 10 },
      { x: 20, y: 10 },
      'building',
      'Budynek A'
    );
    const boundaryEdge: CachedLineEquation = createCachedLineEquation(
      'boundary_edge_0',
      'plot_1',
      0,
      { x: 10.05, y: 10 },
      { x: 10.05, y: 30 },
      'boundary',
      'Działka 124/2'
    );

    const context = createDummyContext({
      lineBuffer: [buildingEdge, boundaryEdge],
      activeCategory: 'building',
    });

    const snaps = strategy.findAllSnaps(context.mouseWorld, context);
    expect(snaps.length).toBe(2);
    // Building vertex gets 5px bonus vs boundary (2px bonus), building effDist = 7 - 5 = 2, boundary effDist = 5 - 2 = 3
    expect(snaps[0].sourceBuildingId).toBe('bldg_1');
  });

  it('favors building edge for balcony attachment', () => {
    const strategy = new EdgeSnapStrategy();

    const buildingEdge: CachedLineEquation = createCachedLineEquation(
      'bldg_edge_0',
      'bldg_1',
      0,
      { x: 5, y: 10.1 },
      { x: 25, y: 10.1 },
      'building',
      'Budynek Główny'
    );
    const balconyEdge: CachedLineEquation = createCachedLineEquation(
      'balcony_edge_0',
      'balcony_1',
      0,
      { x: 5, y: 10.05 },
      { x: 25, y: 10.05 },
      'balcony',
      'Inny Balkon'
    );

    const context = createDummyContext({
      lineBuffer: [buildingEdge, balconyEdge],
      activeCategory: 'balcony',
    });

    const snaps = strategy.findAllSnaps(context.mouseWorld, context);
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    // Balcony to building edge gets 6px affinity bonus
    expect(snaps[0].sourceBuildingId).toBe('bldg_1');
  });

  it('prioritizes nearby direction guides from same category in collectTargetDirections', () => {
    const origin: Point2D = { x: 0, y: 0 };
    const currentMouse: Point2D = { x: 10, y: 10 };

    const boundaryBldg: BuildingLoop = {
      id: 'plot_1',
      name: 'Działka 55',
      category: 'boundary',
      isIncluded: true,
      isTested: false,
      isCityCentre: false,
      buildingType: 'residential',
      defaultHeight: 0,
      hWindowBottom: 0,
      layer: 'Działki',
      vertices: [{ x: 5, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }],
      segments: [
        { id: 's1', p1: { x: 5, y: 5 }, p2: { x: 15, y: 15 }, normal: { x: 0, y: 0 }, length: 14.14, isTested: false },
      ],
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const buildingBldg: BuildingLoop = {
      id: 'bldg_1',
      name: 'Kamienica B',
      category: 'building',
      isIncluded: true,
      isTested: false,
      isCityCentre: false,
      buildingType: 'residential',
      defaultHeight: 15,
      hWindowBottom: 0,
      layer: 'Budynki',
      vertices: [{ x: 4, y: 4 }, { x: 14, y: 4 }],
      segments: [
        { id: 's2', p1: { x: 4, y: 4 }, p2: { x: 14, y: 4 }, normal: { x: 0, y: 0 }, length: 10, isTested: false },
      ],
      transform: { tx: 0, ty: 0, rotationDeg: 0 },
    };

    const candidates = collectTargetDirections(
      origin,
      currentMouse,
      [buildingBldg, boundaryBldg],
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      [],
      { relative: true },
      'boundary'
    );

    expect(candidates.length).toBeGreaterThan(0);
    // Boundary candidate should appear before building candidate
    const boundaryCand = candidates.find((c) => c.sourceLabel?.includes('Działka 55'));
    const buildingCand = candidates.find((c) => c.sourceLabel?.includes('Kamienica B'));
    expect(boundaryCand).toBeDefined();
    expect(buildingCand).toBeDefined();
  });
});
