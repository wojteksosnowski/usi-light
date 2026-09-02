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
});
