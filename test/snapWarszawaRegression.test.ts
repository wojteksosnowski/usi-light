import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BuildingLoop, Point2D } from '../src/types/geometry';
import {
  buildLineBufferFromBuildings,
  flattenLineBuffer,
  createCachedLineEquation,
} from '../src/utils/lineBufferEngine';
import {
  SnapCoordinator,
  SnapContext,
  OtrackManager,
  evaluateBuildingDragMultiSnap,
  calculateDirectionSnap,
} from '../src/engine/snapping';
import { analyzeSegmentsStatistics } from '../src/utils/segmentStatistics';

describe('Comprehensive Snapping & Direction Regression Tests - Warszawa Dataset', () => {
  const filePath = path.resolve('C:/py/usi-light/reference/warszawa.json');
  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const buildings: BuildingLoop[] = rawData.buildings;

  const lineBufferMap = buildLineBufferFromBuildings(buildings);
  const lineBuffer = flattenLineBuffer(lineBufferMap);

  const worldToScreen = (wx: number, wy: number) => ({ sx: wx * 20, sy: wy * 20 });
  const screenToWorld = (sx: number, sy: number) => ({ wx: sx / 20, wy: sy / 20 });

  const coordinator = new SnapCoordinator();

  it('1. Vertex / Endpoint Snap triggers accurately on Warszawa buildings', () => {
    const edge = lineBuffer[0];
    const targetVertex = edge.p1;
    const mouse: Point2D = { x: targetVertex.x + 0.05, y: targetVertex.y - 0.05 };

    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: worldToScreen(mouse.x, mouse.y),
      worldToScreen,
      screenToWorld,
      buildings,
      lineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      thresholdPx: 14,
    };

    const res = coordinator.evaluate(mouse, ctx);
    expect(res.snapped).toBe(true);
    expect(res.type).toBe('vertex');
    expect(res.point.x).toBeCloseTo(targetVertex.x, 2);
    expect(res.point.y).toBeCloseTo(targetVertex.y, 2);
  });

  it('2. Midpoint Snap triggers at edge center with clearance from endpoints', () => {
    const longEdge = lineBuffer.find((e) => e.length >= 8.0) || lineBuffer[0];
    const midX = (longEdge.p1.x + longEdge.p2.x) / 2;
    const midY = (longEdge.p1.y + longEdge.p2.y) / 2;

    const mouse: Point2D = { x: midX + 0.05, y: midY - 0.05 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: worldToScreen(mouse.x, mouse.y),
      worldToScreen,
      screenToWorld,
      buildings,
      lineBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      thresholdPx: 14,
    };

    const res = coordinator.evaluate(mouse, ctx);
    expect(res.snapped).toBe(true);
    expect(res.type).toBe('midpoint');
    expect(res.point.x).toBeCloseTo(midX, 2);
    expect(res.point.y).toBeCloseTo(midY, 2);
  });

  it('3. Perpendicular Snap triggers from drawing origin to wall', () => {
    coordinator.clearStickySnap();
    const edge = lineBuffer.find((e) => e.length >= 10.0) || lineBuffer[0];
    // Create an origin point perpendicular to edge at 35% along the wall
    const targetX = edge.p1.x + 0.35 * (edge.p2.x - edge.p1.x);
    const targetY = edge.p1.y + 0.35 * (edge.p2.y - edge.p1.y);
    const origin: Point2D = { x: targetX + 5.0 * edge.A, y: targetY + 5.0 * edge.B };

    const mouse: Point2D = { x: targetX + 0.08, y: targetY - 0.08 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: worldToScreen(mouse.x, mouse.y),
      worldToScreen,
      screenToWorld,
      buildings,
      lineBuffer: [edge],
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      originPoint: origin,
      thresholdPx: 14,
    };

    const res = coordinator.evaluate(mouse, ctx);
    expect(res.snapped).toBe(true);
    expect(res.type).toBe('perpendicular');
    expect(res.point.x).toBeCloseTo(targetX, 1);
    expect(res.point.y).toBeCloseTo(targetY, 1);
  });

  it('4. Intersection Snap triggers at intersection of intersecting wall lines', () => {
    const e1 = createCachedLineEquation('test_e1', 'b1', 0, { x: 0, y: 5 }, { x: 20, y: 5 });
    const e2 = createCachedLineEquation('test_e2', 'b2', 0, { x: 10, y: 0 }, { x: 10, y: 20 });
    const customBuffer = [e1, e2];

    const mouse: Point2D = { x: 10.08, y: 5.06 };
    const ctx: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: worldToScreen(mouse.x, mouse.y),
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: customBuffer,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      thresholdPx: 14,
    };

    const res = coordinator.evaluate(mouse, ctx);
    expect(res.snapped).toBe(true);
    expect(res.type).toBe('intersection');
    expect(res.point.x).toBeCloseTo(10, 2);
    expect(res.point.y).toBeCloseTo(5, 2);
  });

  it('5. Sticky Snap Hysteresis prevents snap jitter and maintains active snap within release radius', () => {
    coordinator.clearStickySnap();
    const edge = lineBuffer[0];
    const targetVertex = edge.p1;

    // First evaluation: inside capture radius (e.g. 5px from vertex)
    const mouse1: Point2D = { x: targetVertex.x + 0.1, y: targetVertex.y };
    const ctx1: SnapContext = {
      mouseWorld: mouse1,
      mouseScreen: worldToScreen(mouse1.x, mouse1.y),
      worldToScreen,
      screenToWorld,
      buildings,
      lineBuffer: [edge],
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      thresholdPx: 12, // capture radius = 12px
    };

    const res1 = coordinator.evaluate(mouse1, ctx1);
    expect(res1.snapped).toBe(true);
    expect(res1.type).toBe('vertex');

    // Second evaluation: mouse moved to 15px from vertex (beyond capture 12px but within release radius 18px)
    const mouse2Screen = { sx: worldToScreen(targetVertex.x, targetVertex.y).sx + 15, sy: worldToScreen(targetVertex.x, targetVertex.y).sy };
    const mouse2 = screenToWorld(mouse2Screen.sx, mouse2Screen.sy);

    const ctx2: SnapContext = {
      mouseWorld: mouse2,
      mouseScreen: mouse2Screen,
      worldToScreen,
      screenToWorld,
      buildings,
      lineBuffer: [edge],
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      thresholdPx: 12,
    };

    const res2 = coordinator.evaluate(mouse2, ctx2);
    // Hysteresis keeps the vertex snap!
    expect(res2.snapped).toBe(true);
    expect(res2.type).toBe('vertex');
    expect(res2.point.x).toBeCloseTo(targetVertex.x, 2);
    expect(res2.point.y).toBeCloseTo(targetVertex.y, 2);
  });

  it('6. OTRACK Manager acquires points with hover dwell and calculates ray intersections', () => {
    const otrack = new OtrackManager(300, 2);
    const pA: Point2D = { x: 0, y: 0 };
    const pB: Point2D = { x: 20, y: 15 };

    // Hover dwell on Point A for 350ms
    const resA = otrack.updateDwell(pA, { sx: 0, sy: 0 }, 'bldgA', 1000);
    expect(resA.newlyAcquired).toBe(false);
    const resA2 = otrack.updateDwell(pA, { sx: 0, sy: 0 }, 'bldgA', 1350);
    expect(resA2.newlyAcquired).toBe(true);

    // Hover dwell on Point B for 350ms
    const resB = otrack.updateDwell(pB, { sx: 400, sy: 300 }, 'bldgB', 2000);
    expect(resB.newlyAcquired).toBe(false);
    const resB2 = otrack.updateDwell(pB, { sx: 400, sy: 300 }, 'bldgB', 2350);
    expect(resB2.newlyAcquired).toBe(true);

    expect(otrack.getAnchors().length).toBe(2);

    // Expected intersection of Horizontal ray from B (y=15) and Vertical ray from A (x=0) is (0, 15)
    const mouseNearInt: Point2D = { x: 0.1, y: 14.9 };
    const ctx: SnapContext = {
      mouseWorld: mouseNearInt,
      mouseScreen: worldToScreen(mouseNearInt.x, mouseNearInt.y),
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: [],
      isOsnapActive: true,
      isDirectionSnappingActive: true,
      thresholdPx: 14,
    };

    const snap = otrack.evaluateOtrackSnap(mouseNearInt, ctx);
    expect(snap).not.toBeNull();
    expect(snap?.type).toBe('otrack_intersection');
    expect(snap?.point.x).toBeCloseTo(0, 1);
    expect(snap?.point.y).toBeCloseTo(15, 1);
  });

  it('7. High-Pass Filter (HPF) in segment statistics eliminates short noise segments and reinforces orthogonal pairs', () => {
    const stats = analyzeSegmentsStatistics(buildings, { minLengthMeters: 0.3, noisePercentileCutoff: 20 });
    expect(stats.dominantDirections.length).toBeGreaterThan(0);
    expect(stats.lengthCutoffMeters).toBeGreaterThanOrEqual(0.3);

    const dom = stats.dominantDirections[0];
    // Verify orthogonal pair relationship: |ortho - angle| === 90
    const diff = Math.abs(dom.orthogonalDeg - dom.angleDeg);
    expect(diff).toBe(90);
  });

  it('8. objectDragSnap prioritizes dragAnchorVertex to prevent distant corner snapping', () => {
    const refEdge = createCachedLineEquation('ref_wall', 'b_ref', 0, { x: 50, y: 0 }, { x: 60, y: 0 });
    const movingBldgVerts: Point2D[] = [
      { x: 50.1, y: 0.05 }, // Narożnik A (blisko myszy)
      { x: 150.1, y: 0.05 }, // Narożnik B (daleko, 100m dalej)
      { x: 150.1, y: 50.05 },
      { x: 50.1, y: 50.05 },
    ];

    const dragAnchor = movingBldgVerts[0]; // Narożnik A
    const snap = evaluateBuildingDragMultiSnap({
      movingVertices: movingBldgVerts,
      movingBuildingId: 'b_drag',
      referenceBuffer: [refEdge],
      dragAnchorVertex: dragAnchor,
      distanceThresholdMeters: 0.35,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relation).toBe('vertex_to_vertex');
    expect(snap?.sourcePoint?.x).toBeCloseTo(50.1);
    expect(snap?.deltaX).toBeCloseTo(-0.1);
    expect(snap?.deltaY).toBeCloseTo(-0.05);
  });

  it('9. Candidate cycling with Tab key cycles across all candidate matches', () => {
    // Styk 2 narożników w punkcie (0,0)
    const e1 = createCachedLineEquation('e1', 'b1', 0, { x: 0, y: 0 }, { x: 10, y: 0 });
    const e2 = createCachedLineEquation('e2', 'b2', 0, { x: 0, y: 0 }, { x: 0, y: 10 });
    const lineBuf = [e1, e2];

    const mouse: Point2D = { x: 0.05, y: 0.05 };
    const ctxTab0: SnapContext = {
      mouseWorld: mouse,
      mouseScreen: worldToScreen(mouse.x, mouse.y),
      worldToScreen,
      screenToWorld,
      buildings: [],
      lineBuffer: lineBuf,
      isOsnapActive: true,
      isDirectionSnappingActive: false,
      candidateIndex: 0,
    };
    const snap0 = coordinator.evaluate(mouse, ctxTab0);
    expect(snap0.snapped).toBe(true);

    const ctxTab1: SnapContext = {
      ...ctxTab0,
      candidateIndex: 1,
    };
    const snap1 = coordinator.evaluate(mouse, ctxTab1);
    expect(snap1.snapped).toBe(true);
  });
});
