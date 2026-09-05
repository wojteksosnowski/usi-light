import { describe, it, expect } from 'vitest';
import {
  normalizeAngle180,
  normalizeAngle360,
  angleDiff180,
  collectTargetDirections,
  calculateDirectionSnap,
} from './directionSnapping';
import { BuildingLoop } from '../types/geometry';
import { createBuildingFromVertices } from './dxfParser';

describe('directionSnapping', () => {
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
      { x: 10, y: 0 }, // segment angle 0 deg
    ];
    const candidates = collectTargetDirections({ x: 10, y: 0 }, { x: 10, y: 5 }, [], [], polyline);
    const angles = candidates.map((c) => Math.round(c.angleDeg));

    // Should include 0 deg (parallel) and 90 deg (perpendicular)
    expect(angles).toContain(0);
    expect(angles).toContain(90);
  });

  it('snaps mouse position to horizontal axis (0 deg / parallel)', () => {
    const origin = { x: 0, y: 0 };
    const mouse = { x: 10, y: 0.3 }; // slightly off 0 deg (atan2(0.3, 10) ≈ 1.7 deg)

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
      { x: 10, y: 0 }, // horizontal segment ending at (10, 0)
    ];
    const origin = { x: 10, y: 0 };
    const mouse = { x: 10.2, y: 8 }; // aiming upwards perpendicular, slightly tilted

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

  it('does not snap if outside tolerance', () => {
    const origin = { x: 0, y: 0 };
    const mouse = { x: 10, y: 5 }; // ~26.5 deg, not near 0° or 90°

    const snap = calculateDirectionSnap({
      originPoint: origin,
      currentMouseWorld: mouse,
      dominantDirections: [{ angleDeg: 0, orthogonalDeg: 90, totalLength: 100, percentage: 100 }],
      angleToleranceDeg: 4.0,
    });

    expect(snap).toBeNull();
  });

  it('snaps a dragged vertex relative to its adjacent polygon vertex', () => {
    // Polygon vertex at (10, 0) and previous at (0, 0)
    const prevV = { x: 0, y: 0 };
    const mouse = { x: 15.2, y: 0.1 }; // dragged near horizontal extension

    const snap = calculateDirectionSnap({
      originPoint: prevV,
      currentMouseWorld: mouse,
      dominantDirections: [{ angleDeg: 0, orthogonalDeg: 90, totalLength: 100, percentage: 100 }],
      angleToleranceDeg: 4.0,
    });

    expect(snap).not.toBeNull();
    expect(snap?.snappedPoint.y).toBeCloseTo(0, 2);
    expect(snap?.snappedPoint.x).toBeCloseTo(15.2, 1);
  });

  it('collects strictly 0° and 90° axes from polyline segments without secondary 45/30 angle clutter', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 }, // Seg 1: 0°
      { x: 10, y: 10 }, // Seg 2: 90°
    ];
    const candidates = collectTargetDirections({ x: 10, y: 10 }, { x: 15, y: 15 }, [], [], polyline);
    const angles = candidates.map((c) => Math.round(c.angleDeg));

    // Should include 0°, 90°
    expect(angles).toContain(0);
    expect(angles).toContain(90);
    // Should NOT include secondary 45°, 30°, 60°
    expect(angles).not.toContain(45);
    expect(angles).not.toContain(30);
    expect(angles).not.toContain(60);
  });

  it('excludes moving segments when excludeSegmentIndices is specified', () => {
    const bldg = createBuildingFromVertices(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      'Bldg 1',
      10.0,
      true
    );

    // Exclude s0 and s1
    const candidates = collectTargetDirections(
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      [bldg],
      [],
      [],
      undefined,
      bldg.id,
      bldg.id,
      [0, 1]
    );

    expect(candidates.length).toBeGreaterThan(0);
  });

  it('prioritizes hovered/indicated building over background buildings', () => {
    const bldgHovered = createBuildingFromVertices(
      [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 0 }],
      'Hovered Bldg',
      10.0,
      false
    );
    bldgHovered.id = 'bldg-hovered-unique';

    const bldgBackground = createBuildingFromVertices(
      [{ x: 100, y: 100 }, { x: 105, y: 108.66 }, { x: 100, y: 108.66 }],
      'Background Bldg',
      10.0,
      false
    );
    bldgBackground.id = 'bldg-bg-unique';

    const candidates = collectTargetDirections(
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      [bldgBackground, bldgHovered],
      [],
      [],
      bldgHovered.id
    );

    // Hovered building should have higher priority (lower priority number) than background building
    const hoveredCand = candidates.find((c) => c.sourceLabel?.includes('Hovered Bldg'));
    const bgCand = candidates.find((c) => c.sourceLabel?.includes('Background Bldg'));
    expect(hoveredCand).toBeDefined();
    expect(bgCand).toBeDefined();
    expect(hoveredCand!.priority).toBeLessThan(bgCand!.priority);
  });

  it('clusters directions near dominant scene axis to prevent noisy angular jitter', () => {
    // Dominant axis from statistics is 15.0° (and 105.0°)
    const dom = [{ angleDeg: 15.0, orthogonalDeg: 105.0, totalLength: 100, percentage: 80 }];

    // Building with a slightly tilted wall at 16.5° (difference of 1.5°, well within 4° cluster threshold)
    const slightlyTiltedWall = createBuildingFromVertices(
      [
        { x: 0, y: 0 },
        { x: 10 * Math.cos((16.5 * Math.PI) / 180), y: 10 * Math.sin((16.5 * Math.PI) / 180) },
        { x: 0, y: 10 },
      ],
      'Tilted Wall',
      10.0,
      false
    );

    const candidates = collectTargetDirections(
      { x: 0, y: 0 },
      { x: 10, y: 3 },
      [slightlyTiltedWall],
      dom,
      []
    );

    // Candidates should NOT include the raw 16.5° competing direction; it should be clustered to 15.0°
    const rawTilted = candidates.find((c) => Math.abs(c.angleDeg - 16.5) < 0.2);
    expect(rawTilted).toBeUndefined();

    // The dominant 15.0° must be present with top priority
    const dominantCandidate = candidates.find((c) => Math.abs(c.angleDeg - 15.0) < 0.1);
    expect(dominantCandidate).toBeDefined();
    expect(dominantCandidate?.priority).toBe(2);
  });

  it('attaches sourceSegment to candidate and snap result for edge highlighting', () => {
    const bldg = createBuildingFromVertices(
      [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
      'Test Bldg',
      10.0,
      false
    );
    bldg.id = 'bldg-source-test';

    const snap = calculateDirectionSnap({
      originPoint: { x: 5, y: 5 },
      currentMouseWorld: { x: 15, y: 5.05 }, // moving parallel (0 deg) to horizontal wall
      buildings: [bldg],
      hoveredBuildingId: bldg.id,
      angleToleranceDeg: 4.0,
    });

    expect(snap).not.toBeNull();
    expect(snap?.sourceSegment).toBeDefined();
    expect(snap?.sourceSegment?.buildingId).toBe('bldg-source-test');
  });

  it('snaps accurately to the intersection of two guide lines (Dual-Guide Intersection Snapping)', () => {
    // Guide 1 from origin (0, 0) along 0° (horizontal) -> y = 0
    // Guide 2 from secondary origin (10, 10) along 90° (vertical) -> x = 10
    // Intersection must be at (10, 0)
    const origin = { x: 0, y: 0 };
    const secOrigin = { x: 10, y: 10 };
    const mouse = { x: 9.9, y: 0.1 }; // cursor close to (10, 0)

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

  it('uses staticReferenceSegments without creating moving oblique axes', () => {
    const origin = { x: 0, y: 0 };
    const mouse = { x: 7, y: 8 }; // arbitrary position
    const staticSegs = [
      { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, label: 'Dolna krawędź' },
      { p1: { x: 10, y: 0 }, p2: { x: 10, y: 10 }, label: 'Prawa krawędź' },
    ];

    const candidates = collectTargetDirections(
      origin,
      mouse,
      [],
      [],
      [], // polylineVertices empty
      undefined,
      undefined,
      undefined,
      undefined,
      staticSegs
    );

    const angles = candidates.map((c) => Math.round(c.angleDeg));
    expect(angles).toContain(0);
    expect(angles).toContain(90);
    // Should NOT contain oblique angle atan2(8, 7) ≈ 48.8°
    expect(angles).not.toContain(49);
  });

  it('snaps accurately to the intersection between a guide line and a building edge (Guide ✕ Edge)', () => {
    // Target building with vertical wall from (20, -10) to (20, 20) -> edge at x = 20
    const bldg = createBuildingFromVertices(
      [{ x: 20, y: -10 }, { x: 30, y: -10 }, { x: 30, y: 20 }, { x: 20, y: 20 }],
      'Obstacle Bldg',
      15.0,
      false
    );
    bldg.id = 'bldg-target-edge';

    // Guide from origin (0, 5) along 0° (horizontal y = 5)
    // Intersects building edge at (20, 5)
    const origin = { x: 0, y: 5 };
    const mouse = { x: 19.8, y: 5.1 }; // cursor near (20, 5)

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
    expect(snap?.sourceLabel).toContain('Przecięcie z krawędzią');
  });

  it('snaps accurately to an oblique guide line intersecting a slanted static edge', () => {
    // Static edge from (0, 10) to (10, 0) -> line x + y = 10
    const staticSegs = [
      { p1: { x: 0, y: 10 }, p2: { x: 10, y: 0 }, label: 'Krawędź ukośna' }
    ];

    // Guide line from (0, 0) along 45° -> line y = x
    // Intersection with x + y = 10 must be at (5, 5)
    const origin = { x: 0, y: 0 };
    const mouse = { x: 4.9, y: 5.1 }; // cursor near (5, 5)

    const snap = calculateDirectionSnap({
      originPoint: origin,
      currentMouseWorld: mouse,
      staticReferenceSegments: staticSegs,
      dominantDirections: [{ angleDeg: 45, orthogonalDeg: 135, totalLength: 50, percentage: 100 }],
      angleToleranceDeg: 5.0,
    });

    expect(snap).not.toBeNull();
    expect(snap?.relationType).toBe('guide_intersection');
    expect(snap?.snappedPoint.x).toBeCloseTo(5, 2);
    expect(snap?.snappedPoint.y).toBeCloseTo(5, 2);
  });
});

