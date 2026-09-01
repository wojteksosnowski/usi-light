import { describe, it, expect } from 'vitest';
import {
  normalizeAngle180,
  normalizeAngle360,
  angleDiff180,
  collectTargetDirections,
  calculateDirectionSnap,
} from './directionSnapping';
import { BuildingLoop } from '../types/geometry';

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
});
