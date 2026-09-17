import { describe, it, expect } from 'vitest';
import {
  SnapCoordinator,
  SnapContext,
  VertexSnapStrategy,
  MidpointSnapStrategy,
  EdgeSnapStrategy,
  DirectionSnapStrategy,
  GridSnapStrategy,
  calculateDirectionSnap,
  collectTargetDirections,
  evaluateBuildingDragMultiSnap,
  evaluateEdgeDragSnap,
  evaluateCollinearAndParallelLock,
} from '../src/engine/snapping';
import { BuildingLoop, Point2D } from '../src/types/geometry';
import * as fs from 'fs';
import * as path from 'path';
import {
  createCachedLineEquation,
  getOrBuildBuildingLineBuffer,
  flattenLineBuffer,
  buildLineBufferFromBuildings,
  buildLineBufferForPolygon,
} from '../src/utils/lineBufferEngine';
import { analyzeSegmentsStatistics } from '../src/utils/segmentStatistics';
import {
  normalizeAngle180,
  normalizeAngle360,
  angleDiff180,
  lineIntersection2D,
  lineSegmentIntersection2D,
} from '../src/utils/math2d';
import { createBuildingFromVertices } from '../src/utils/dxfParser';

describe('SnapCoordinator & Strategies Pipeline', () => {
  const coordinator = new SnapCoordinator();

  const dummyBuilding: BuildingLoop = {
    id: 'b1',
    name: 'Building 1',
    layer: '0',
    isTested: false,
    defaultHeight: 15,
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    segments: [],
    isClockwise: false,
  };

  const lineBuffer = [
    createCachedLineEquation('b1_0', 'b1', 0, { x: 0, y: 0 }, { x: 10, y: 0 }),
    createCachedLineEquation('b1_1', 'b1', 1, { x: 10, y: 0 }, { x: 10, y: 10 }),
    createCachedLineEquation('b1_2', 'b1', 2, { x: 10, y: 10 }, { x: 0, y: 10 }),
    createCachedLineEquation('b1_3', 'b1', 3, { x: 0, y: 10 }, { x: 0, y: 0 }),
  ];

  const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 20, sy: wy * 20 });
  const screenToWorld = (sx: number, sy: number) => ({ wx: sx / 20, wy: sy / 20 });

  it('prioritizes VertexSnap (endpoint) over GridSnap and DirectionSnap', () => {
    const mouse: Point2D = { x: 0.1, y: 0.1 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 2, sy: 2 },
      worldToScreen,
      screenToWorld,
      buildings: [dummyBuilding],
      lineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: true,
      gridSnapEnabled: true,
      gridSize: 1.0,
      originPoint: { x: 5, y: 5 },
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('vertex');
    expect(result.point.x).toBeCloseTo(0);
    expect(result.point.y).toBeCloseTo(0);
  });

  it('detects MidpointSnap correctly when hovering near the center of an edge', () => {
    const mouse: Point2D = { x: 5.05, y: 0.05 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 5.05 * 20, sy: 0.05 * 20 },
      worldToScreen,
      screenToWorld,
      buildings: [dummyBuilding],
      lineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      gridSnapEnabled: false,
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('midpoint');
    expect(result.point.x).toBeCloseTo(5);
    expect(result.point.y).toBeCloseTo(0);
  });

  it('detects EdgeSnap (nearest) when cursor is on edge away from vertices and midpoint', () => {
    const mouse: Point2D = { x: 2.5, y: 0.05 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 2.5 * 20, sy: 0.05 * 20 },
      worldToScreen,
      screenToWorld,
      buildings: [dummyBuilding],
      lineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      gridSnapEnabled: false,
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('edge');
    expect(result.point.x).toBeCloseTo(2.5);
    expect(result.point.y).toBeCloseTo(0);
  });

  it('snaps to Direction (ortho / parallel) when osnap does not hit', () => {
    const origin: Point2D = { x: 0, y: 0 };
    const mouse: Point2D = { x: 10, y: 0.1 }; // close to 0 deg axis
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 200, sy: 2 },
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: [],
      isOsnapActive: false,
      isDirectionSnappingActive: true,
      originPoint: origin,
      dominantDirections: [{ angleDeg: 0, orthogonalDeg: 90, totalLength: 100, percentage: 100 }],
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('direction');
    expect(result.point.y).toBeCloseTo(0, 1);
  });

  it('falls back to GridSnap when Osnap and Direction are inactive', () => {
    const mouse: Point2D = { x: 3.02, y: 4.01 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 3.02 * 20, sy: 4.01 * 20 },
      worldToScreen,
      screenToWorld,
      buildings: [dummyBuilding],
      lineBuffer: [],
      isOsnapActive: false,
      isDirectionSnappingActive: false,
      gridSnapEnabled: true,
      gridSize: 1.0,
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(true);
    expect(result.type).toBe('grid');
    expect(result.point.x).toBe(3.0);
    expect(result.point.y).toBe(4.0);
  });

  it('returns unsnapped point when no snap rule triggers', () => {
    const mouse: Point2D = { x: 50.3, y: 40.7 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: { sx: 50.3 * 20, sy: 40.7 * 20 },
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: [],
      isOsnapActive: false,
      isDirectionSnappingActive: false,
      gridSnapEnabled: false,
    };

    const result = coordinator.evaluate(mouse, ctx);
    expect(result.snapped).toBe(false);
    expect(result.type).toBe('none');
    expect(result.point.x).toBe(50.3);
    expect(result.point.y).toBe(40.7);
  });

  it('allows registering and unregistering custom strategies', () => {
    const coord = new SnapCoordinator([]);
    expect(coord.getStrategies().length).toBe(0);

    const customStrat = {
      name: 'CustomAlwaysSnapOrigin',
      priority: 1,
      findSnap: () => ({
        point: { x: 0, y: 0 },
        snapped: true,
        type: 'vertex' as const,
      }),
    };

    coord.registerStrategy(customStrat);
    expect(coord.getStrategies().length).toBe(1);

    const res = coord.evaluate({ x: 99, y: 99 }, {
      mouseWorld: { x: 99, y: 99 },
      mouseScreen: { sx: 0, sy: 0 },
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: [],
      isOsnapActive: true,
      isDirectionSnappingActive: false,
    });
    expect(res.point).toEqual({ x: 0, y: 0 });

    coord.unregisterStrategy('CustomAlwaysSnapOrigin');
    expect(coord.getStrategies().length).toBe(0);
  });

  it('verifies objectDragSnap functions properly', () => {
    const refEdge = createCachedLineEquation('ref1', 'b_ref', 0, { x: 0, y: 0 }, { x: 10, y: 0 });
    const dragEdge = createCachedLineEquation('drag1', 'b_drag', 0, { x: 5, y: 0.05 }, { x: 15, y: 0.05 });
    const lock = evaluateCollinearAndParallelLock(dragEdge, [refEdge], 0.05, 0.2);
    expect(lock?.isParallel).toBe(true);
    expect(lock?.isCollinear).toBe(true);

    const movingVerts = [
      { x: 10.05, y: 0.02 },
      { x: 20.05, y: 0.02 },
      { x: 20.05, y: 10.02 },
      { x: 10.05, y: 10.02 },
    ];

    const snap = evaluateBuildingDragMultiSnap({
      movingVertices: movingVerts,
      movingBuildingId: 'b_move',
      referenceBuffer: [refEdge],
      distanceThresholdMeters: 0.3,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('vertex_to_vertex');
    expect(snap?.deltaX).toBeCloseTo(-0.05);
    expect(snap?.deltaY).toBeCloseTo(-0.02);
  });
});

describe('Direction Snapping & Math2D Angular Utilities', () => {
  it('correctly normalizes angles and calculates differences in 180 deg axis', () => {
    expect(normalizeAngle180(0)).toBe(0);
    expect(normalizeAngle180(180)).toBe(0);
    expect(normalizeAngle180(270)).toBe(90);
    expect(normalizeAngle180(-45)).toBe(135);

    expect(normalizeAngle360(-10)).toBe(350);
    expect(normalizeAngle360(370)).toBe(10);

    expect(angleDiff180(0, 5)).toBe(5);
    expect(angleDiff180(179, 1)).toBe(2);
    expect(angleDiff180(45, 135)).toBe(90);
  });

  it('collects orthogonal axes from polyline vertices', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const candidates = collectTargetDirections({ x: 10, y: 0 }, { x: 10, y: 5 }, [], [], polyline);
    const angles = candidates.map((c) => Math.round(c.angleDeg));

    expect(angles).toContain(0);
    expect(angles).toContain(90);
  });

  it('snaps mouse position to horizontal axis (0 deg / parallel)', () => {
    const origin = { x: 0, y: 0 };
    const mouse = { x: 10, y: 0.3 };

    const snap = calculateDirectionSnap({
      originPoint: origin,
      currentMouseWorld: mouse,
      dominantDirections: [{ angleDeg: 0, orthogonalDeg: 90, totalLength: 100, percentage: 100 }],
      angleToleranceDeg: 4.0,
    });

    expect(snap).not.toBeNull();
    expect(snap?.guideAngleDeg).toBe(0);
    expect(snap?.snappedPoint.x).toBeCloseTo(10, 2);
    expect(snap?.snappedPoint.y).toBeCloseTo(0, 2);
  });

  it('snaps mouse position to perpendicular (90 deg) relative to last polyline segment', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const origin = { x: 10, y: 0 };
    const mouse = { x: 10.2, y: 8 };

    const snap = calculateDirectionSnap({
      originPoint: origin,
      currentMouseWorld: mouse,
      polylineVertices: polyline,
      angleToleranceDeg: 4.0,
    });

    expect(snap).not.toBeNull();
    expect(snap?.guideAngleDeg).toBe(90);
    expect(snap?.snappedPoint.x).toBeCloseTo(10, 2);
    expect(snap?.snappedPoint.y).toBeCloseTo(8, 2);
    expect(snap?.relationType).toBe('perpendicular');
  });

  it('snaps accurately to dual-guide intersection', () => {
    const origin = { x: 0, y: 0 };
    const secOrigin = { x: 10, y: 10 };
    const mouse = { x: 9.9, y: 0.1 };

    const snap = calculateDirectionSnap({
      originPoint: origin,
      secondaryOriginPoints: [secOrigin],
      currentMouseWorld: mouse,
      dominantDirections: [{ angleDeg: 0, orthogonalDeg: 90, totalLength: 100, percentage: 100 }],
      angleToleranceDeg: 5.0,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relationType).toBe('guide_intersection');
    expect(snap?.snappedPoint.x).toBeCloseTo(10, 2);
    expect(snap?.snappedPoint.y).toBeCloseTo(0, 2);
    expect(snap?.secondGuideLine).toBeDefined();
  });

  it('snaps accurately to guide intersecting building edge (Guide ✕ Edge)', () => {
    const bldg = createBuildingFromVertices(
      [{ x: 20, y: -10 }, { x: 30, y: -10 }, { x: 30, y: 20 }, { x: 20, y: 20 }],
      'Obstacle Bldg',
      15.0,
      false
    );
    bldg.id = 'bldg-target-edge';

    const origin = { x: 0, y: 5 };
    const mouse = { x: 19.8, y: 5.1 };

    const snap = calculateDirectionSnap({
      originPoint: origin,
      currentMouseWorld: mouse,
      buildings: [bldg],
      dominantDirections: [{ angleDeg: 0, orthogonalDeg: 90, totalLength: 100, percentage: 100 }],
      angleToleranceDeg: 5.0,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relationType).toBe('guide_intersection');
    expect(snap?.snappedPoint.x).toBeCloseTo(20, 2);
    expect(snap?.snappedPoint.y).toBeCloseTo(5, 2);
    expect(snap?.intersectedSegment).toBeDefined();
    expect(snap?.intersectedSegment?.buildingId).toBe('bldg-target-edge');
  });

  it('snaps accurately to guide intersecting area / boundary edge (Guide ✕ Edge)', () => {
    const boundaryArea = createBuildingFromVertices(
      [{ x: 25, y: -10 }, { x: 35, y: -10 }, { x: 35, y: 20 }, { x: 25, y: 20 }],
      'Działka 124/2',
      0,
      false,
      'boundary'
    );
    boundaryArea.id = 'bnd-target-edge';

    const origin = { x: 0, y: 10 };
    const mouse = { x: 24.8, y: 10.1 };

    const snap = calculateDirectionSnap({
      originPoint: origin,
      currentMouseWorld: mouse,
      buildings: [boundaryArea],
      dominantDirections: [{ angleDeg: 0, orthogonalDeg: 90, totalLength: 100, percentage: 100 }],
      angleToleranceDeg: 5.0,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relationType).toBe('guide_intersection');
    expect(snap?.snappedPoint.x).toBeCloseTo(25, 2);
    expect(snap?.snappedPoint.y).toBeCloseTo(10, 2);
    expect(snap?.intersectedSegment).toBeDefined();
    expect(snap?.intersectedSegment?.buildingId).toBe('bnd-target-edge');
  });

  it('tracks parallel and perpendicular directions from nearby boundary objects', () => {
    const boundaryArea = createBuildingFromVertices(
      [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 15, y: 25 }, { x: 5, y: 15 }],
      'Działka 45',
      0,
      false,
      'boundary'
    );
    boundaryArea.id = 'bnd-skewed';

    const origin = { x: 0, y: 0 };
    // Edge (10,10)->(20,20) has angle 45 deg
    const mouse = { x: 10, y: 10.1 }; // close to 45 deg ray from (0,0)

    const snap = calculateDirectionSnap({
      originPoint: origin,
      currentMouseWorld: mouse,
      buildings: [boundaryArea],
      angleToleranceDeg: 5.0,
    });

    expect(snap).not.toBeNull();
    expect(snap?.guideAngleDeg).toBeCloseTo(45, 1);
  });

  it('snaps accurately to guide intersecting buffer modifier edge (Guide ✕ Buffer Edge)', () => {
    const boundaryArea = createBuildingFromVertices(
      [{ x: 30, y: -10 }, { x: 40, y: -10 }, { x: 40, y: 20 }, { x: 30, y: 20 }],
      'Działka 124/2',
      0,
      false,
      'boundary'
    );
    boundaryArea.id = 'bnd-with-buffer';
    // Add 4.0m buffer polygon (e.g. x shifted by -4 to x=26)
    boundaryArea.zonePolygons = [
      {
        id: 'zone-1',
        distance: 4.0,
        polygon: [
          { x: 26, y: -14 },
          { x: 44, y: -14 },
          { x: 44, y: 24 },
          { x: 26, y: 24 },
        ],
      },
    ];

    const origin = { x: 0, y: 5 };
    const mouse = { x: 25.8, y: 5.1 }; // close to buffer left edge x=26, y=5

    const snap = calculateDirectionSnap({
      originPoint: origin,
      currentMouseWorld: mouse,
      buildings: [boundaryArea],
      dominantDirections: [{ angleDeg: 0, orthogonalDeg: 90, totalLength: 100, percentage: 100 }],
      angleToleranceDeg: 5.0,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relationType).toBe('guide_intersection');
    expect(snap?.snappedPoint.x).toBeCloseTo(26, 2);
    expect(snap?.snappedPoint.y).toBeCloseTo(5, 2);
    expect(snap?.intersectedSegment).toBeDefined();
    expect(snap?.intersectedSegment?.buildingId).toBe('bnd-with-buffer_zone_0');
    expect(snap?.sourceLabel).toContain('Bufor');
  });

  it('does not produce self-intersections (Guide ✕ Edge) with own edges when dragging a vertex of a single building', () => {
    const bldg = createBuildingFromVertices(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      'Single Building',
      15.0,
      true
    );
    bldg.id = 'single-bldg';

    // Dragging vertex 1 (10, 0). Primary origin is vertex 0 (0, 0), secondary is vertex 2 (10, 10).
    const origin = { x: 0, y: 0 };
    const mouse = { x: 8.5, y: 3.5 };

    const snap = calculateDirectionSnap({
      originPoint: origin,
      currentMouseWorld: mouse,
      buildings: [bldg],
      excludeBuildingId: 'single-bldg',
      staticReferenceSegments: [
        { p1: { x: 10, y: 10 }, p2: { x: 0, y: 10 }, label: 'Ściana 3 (Równoległy)' },
        { p1: { x: 0, y: 10 }, p2: { x: 0, y: 0 }, label: 'Ściana 4 (Równoległy)' },
      ],
      dominantDirections: [{ angleDeg: 0, orthogonalDeg: 90, totalLength: 100, percentage: 100 }],
      angleToleranceDeg: 5.0,
    });

    // There are NO other buildings in the scene, so no Guide x Edge intersection should ever be generated
    if (snap) {
      expect(snap.relationType).not.toBe('guide_intersection');
    }
  });

  it('correctly snaps to rotated building vertices/edges and provides exact real angles (snap-test1.json scenario)', () => {
    const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 20, sy: wy * 20 });
    const screenToWorld = (sx: number, sy: number) => ({ wx: sx / 20, wy: sy / 20 });
    const coordinator = new SnapCoordinator();

    const filePath = path.resolve('C:/py/usi-light/reference/snap-test1.json');
    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const testBuildings: BuildingLoop[] = rawData.buildings;
    const bldgA = testBuildings.find((b) => b.name === 'BudynekA')!;
    expect(bldgA).toBeDefined();

    // 1. Walidacja regeneracji bufora linii z nieaktualnego cache z pliku JSON
    const bldgALines = getOrBuildBuildingLineBuffer(bldgA);
    expect(bldgALines.length).toBe(4);
    expect(bldgALines[0].p1.x).toBeCloseTo(bldgA.vertices[0].x, 3);
    expect(bldgALines[0].p1.y).toBeCloseTo(bldgA.vertices[0].y, 3);

    const fullLineBuffer = flattenLineBuffer(buildLineBufferFromBuildings([bldgA]));

    // 2. Wykrywanie wierzchołka 3 BudynekA (indeks 2: x=-97.05, y=57.34 lub indeks 3: x=-153.65, y=88.02)
    const v3 = bldgA.vertices[2]; // (-97.0548, 57.3452)
    const mouseNearV3: Point2D = { x: v3.x + 0.08, y: v3.y - 0.08 };
    const ctxV3: SnapContext = {
      mouseWorld: mouseNearV3,
      mouseScreen: worldToScreen(mouseNearV3.x, mouseNearV3.y),
      worldToScreen,
      screenToWorld,
      buildings: [bldgA],
      lineBuffer: fullLineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      thresholdPx: 14,
    };
    const snapV3 = coordinator.evaluate(mouseNearV3, ctxV3);
    expect(snapV3.snapped).toBe(true);
    expect(snapV3.type).toBe('vertex');
    expect(snapV3.point.x).toBeCloseTo(v3.x, 2);
    expect(snapV3.point.y).toBeCloseTo(v3.y, 2);

    // 3. Wykrywanie krawędzi 3-4 BudynekA (pomiędzy v2 i v3)
    const v4 = bldgA.vertices[3]; // (-153.6516, 88.0255)
    const midEdge34: Point2D = { x: (v3.x + v4.x) / 2 + 0.05, y: (v3.y + v4.y) / 2 - 0.05 };
    const ctxEdge: SnapContext = {
      mouseWorld: midEdge34,
      mouseScreen: worldToScreen(midEdge34.x, midEdge34.y),
      worldToScreen,
      screenToWorld,
      buildings: [bldgA],
      lineBuffer: fullLineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      thresholdPx: 14,
    };
    const snapEdge = coordinator.evaluate(midEdge34, ctxEdge);
    expect(snapEdge.snapped).toBe(true);
    // snapEdge może być midpoint lub edge
    expect(['midpoint', 'edge']).toContain(snapEdge.type);

    // 4. Weryfikacja dokładnego kąta siatki dominującej i prowadnicy kierunkowej
    const stats = analyzeSegmentsStatistics([bldgA]);
    expect(stats.dominantDirections.length).toBeGreaterThan(0);
    // Rzeczywisty kąt krawędzi BudynekA wynosi 151.53847897620443 (lub ortogonalny 61.53847897620436)
    const domAngle = stats.dominantDirections[0].orthogonalDeg;
    expect(domAngle).toBeCloseTo(151.538, 2);

    // Direction snap od wierzchołka v4 wzdłuż BudynekA
    const mouseAlongEdge: Point2D = { x: v4.x + 10 * Math.cos((151.538 * Math.PI) / 180), y: v4.y + 10 * Math.sin((151.538 * Math.PI) / 180) };
    const dirSnap = calculateDirectionSnap({
      originPoint: v4,
      currentMouseWorld: mouseAlongEdge,
      buildings: [bldgA],
      dominantDirections: stats.dominantDirections,
      hoveredBuildingId: bldgA.id,
      angleToleranceDeg: 5.0,
    });
    expect(dirSnap).not.toBeNull();
    // Kąt prowadnicy musi być DOKŁADNYM kątem ściany bez zaokrąglenia do 152.0
    expect(dirSnap?.guideAngleDeg).toBeCloseTo(151.538, 2);
  });

  it('snaps perpendicular to an infinite edge extension beyond physical segment bounds', () => {
    const coordinator = new SnapCoordinator();
    const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 20, sy: wy * 20 });
    const screenToWorld = (sx: number, sy: number) => ({ wx: sx / 20, wy: sy / 20 });
    // Reference edge on x-axis from (0, 0) to (10, 0)
    const edge = createCachedLineEquation('e1', 'b1', 0, { x: 0, y: 0 }, { x: 10, y: 0 });
    // Origin at (25, 15) -> perpendicular projection onto y=0 line is (25, 0), which is outside x: 0..10
    const origin: Point2D = { x: 25, y: 15 };
    const mouseNearProj: Point2D = { x: 25.05, y: 0.05 };

    const ctx: SnapContext = {
      mouseWorld: mouseNearProj,
      mouseScreen: worldToScreen(mouseNearProj.x, mouseNearProj.y),
      worldToScreen,
      screenToWorld,
      lineBuffer: [edge],
      isOsnapActive: true,
      originPoint: origin,
      thresholdPx: 14,
    };

    const snap = coordinator.evaluate(mouseNearProj, ctx);
    expect(snap.snapped).toBe(true);
    expect(snap.type).toBe('perpendicular');
    expect(snap.point.x).toBeCloseTo(25, 2);
    expect(snap.point.y).toBeCloseTo(0, 2);
    expect(snap.label).toContain('przedłużenia');
    expect(snap.guideLines).toBeDefined();
    expect(snap.guideLines?.some((g) => g.type === 'extension')).toBe(true);
  });

  it('reliably locks vertex-to-vertex during building drag even with non-aligned edge directions', () => {
    // Reference building rotated at 37 degrees
    const refVerts: Point2D[] = [
      { x: 0, y: 0 },
      { x: 8, y: 6 },
      { x: 2, y: 14 },
      { x: -6, y: 8 },
    ];
    const refBuffer = buildLineBufferForPolygon('ref-rot', refVerts);

    // Moving building rotated at 71 degrees, moving near corner (8, 6)
    const movingVerts: Point2D[] = [
      { x: 8.15, y: 6.1 }, // Close to (8, 6)
      { x: 13.15, y: 18.1 },
      { x: 1.15, y: 22.1 },
      { x: -3.85, y: 10.1 },
    ];

    const snap = evaluateBuildingDragMultiSnap({
      movingVertices: movingVerts,
      movingBuildingId: 'mov-rot',
      referenceBuffer: refBuffer,
      distanceThresholdMeters: 0.5, // 30px at 60px/m
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('vertex_to_vertex');
    expect(snap?.deltaX).toBeCloseTo(-0.15, 2);
    expect(snap?.deltaY).toBeCloseTo(-0.1, 2);
  });

  it('supports midpoint dragging relations (vertex to midpoint and midpoint to midpoint)', () => {
    const refVerts: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 }, // Midpoint at (5, 0)
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const refBuffer = buildLineBufferForPolygon('ref-box', refVerts);

    // Moving building with vertex near (5, 0)
    const movingVerts: Point2D[] = [
      { x: 5.1, y: 0.1 }, // Corner near ref midpoint (5, 0)
      { x: 15.1, y: 0.1 },
      { x: 15.1, y: 10.1 },
      { x: 5.1, y: 10.1 },
    ];

    const snap = evaluateBuildingDragMultiSnap({
      movingVertices: movingVerts,
      movingBuildingId: 'mov-box',
      referenceBuffer: refBuffer,
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('vertex_to_midpoint');
    expect(snap?.deltaX).toBeCloseTo(-0.1, 2);
    expect(snap?.deltaY).toBeCloseTo(-0.1, 2);
    expect(snap?.label).toContain('środka ściany');
  });

  it('detects simultaneous Dual-Snap (primary discrete snap + secondary auxiliary snap)', () => {
    const coordinator = new SnapCoordinator();
    const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 20, sy: wy * 20 });
    const screenToWorld = (sx: number, sy: number) => ({ wx: sx / 20, wy: sy / 20 });

    // Edge 1 from (0,0) to (10,0) (Horizontal) -> midpoint at (5, 0)
    const edge1 = createCachedLineEquation('e1', 'b1', 0, { x: 0, y: 0 }, { x: 10, y: 0 });
    // Edge 2 from (5, 0) to (5, 10) (Vertical, intersecting edge1 at (5, 0))
    const edge2 = createCachedLineEquation('e2', 'b2', 0, { x: 5, y: 0 }, { x: 5, y: 10 });

    const mouseNearIntersection: Point2D = { x: 5.02, y: 0.02 };
    const ctx: SnapContext = {
      mouseWorld: mouseNearIntersection,
      mouseScreen: worldToScreen(mouseNearIntersection.x, mouseNearIntersection.y),
      worldToScreen,
      screenToWorld,
      lineBuffer: [edge1, edge2],
      isOsnapActive: true,
      thresholdPx: 14,
    };

    const snap = coordinator.evaluate(mouseNearIntersection, ctx);
    expect(snap.snapped).toBe(true);
    expect(snap.secondarySnap).toBeDefined();
    expect(snap.secondarySnap?.snapped).toBe(true);
  });

  it('maintains sticky lock during edge drag when small mouse jitter occurs', () => {
    const refEdge = createCachedLineEquation('ref-col', 'bldg-ref', 0, { x: 0, y: 10 }, { x: 20, y: 10 });
    const edgeP1 = { x: 5, y: 9.8 };
    const edgeP2 = { x: 15, y: 9.8 };
    const normal = { x: 0, y: 1 };

    // 1. Initial snap when mouse moves to y = 9.9
    const initialSnap = evaluateEdgeDragSnap({
      edgeP1,
      edgeP2,
      normal,
      buildingId: 'bldg-mov',
      edgeIndex: 0,
      tentativeDelta: { dx: 0, dy: 0.1 },
      referenceBuffer: [refEdge],
      distanceThresholdMeters: 0.2,
    });
    expect(initialSnap).not.toBeNull();

    // 2. Mouse jitters slightly past threshold (e.g. dy = 0.25 -> total distance 0.25m from y=10)
    // With sticky lock (up to 0.2 * 1.5 = 0.30m), it should HOLD the snap!
    const jitterSnap = evaluateEdgeDragSnap({
      edgeP1,
      edgeP2,
      normal,
      buildingId: 'bldg-mov',
      edgeIndex: 0,
      tentativeDelta: { dx: 0, dy: 0.24 }, // 0.24m jitter (exceeds 0.2m but within 0.3m release)
      referenceBuffer: [refEdge],
      distanceThresholdMeters: 0.2,
      previousSnap: initialSnap,
    });

    expect(jitterSnap).not.toBeNull();
    expect(jitterSnap?.relation).toBe('edge_to_edge_collinear');
    expect(jitterSnap?.deltaOffset.dy).toBeCloseTo(0.2); // Still locks cleanly to y = 10.0!
  });
});
