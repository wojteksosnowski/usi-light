import { describe, it, expect } from 'vitest';
import {
  createViewportMatrix,
  invertAffineMatrix,
  transformPoint,
  transformPointsFlat,
  multiplyAffineMatrices,
  IDENTITY_MATRIX,
} from './affineMatrix';
import { pointsToBuffer, bufferToPoints, rotatePointsBuffer, translatePointsBuffer } from './transforms';

describe('AffineMatrix2D', () => {
  it('should transform world point to screen point matching analytical formula', () => {
    const panX = 400;
    const panY = 300;
    const scale = 20;
    const rotDeg = 45;

    const matrix = createViewportMatrix(panX, panY, scale, rotDeg);

    const wx = 10;
    const wy = 5;

    const rotRad = (rotDeg * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const expectedSx = panX + scale * (wx * cosR + wy * sinR);
    const expectedSy = panY + scale * (wx * sinR - wy * cosR);

    const pt = transformPoint(matrix, wx, wy);
    expect(pt.x).toBeCloseTo(expectedSx, 5);
    expect(pt.y).toBeCloseTo(expectedSy, 5);
  });

  it('should align edge horizontally when viewRotationDeg matches edge angle (EDGEUCS)', () => {
    const panX = 500;
    const panY = 400;
    const scale = 10;
    const edgeAngleDeg = 17.2275;

    const p1 = { x: -67.7638, y: 78.1272 };
    const p2 = { x: 80.9838, y: 124.2505 };

    // With viewRotationDeg matching edgeAngleDeg, edge becomes horizontal on screen
    const matrix = createViewportMatrix(panX, panY, scale, edgeAngleDeg);
    const s1 = transformPoint(matrix, p1.x, p1.y);
    const s2 = transformPoint(matrix, p2.x, p2.y);

    // Y on screen should be identical (horizontal line)
    expect(s1.y).toBeCloseTo(s2.y, 2);
    // X on screen should increase from p1 to p2
    expect(s2.x).toBeGreaterThan(s1.x);
  });

  it('should invert matrix and accurately map screen coords back to world coords', () => {
    const panX = 520;
    const panY = 380;
    const scale = 15.5;
    const rotDeg = 33.5;

    const viewMat = createViewportMatrix(panX, panY, scale, rotDeg);
    const invMat = invertAffineMatrix(viewMat);

    const originalWorld = { x: 12.345, y: -67.89 };
    const screen = transformPoint(viewMat, originalWorld.x, originalWorld.y);
    const restoredWorld = transformPoint(invMat, screen.x, screen.y);

    expect(restoredWorld.x).toBeCloseTo(originalWorld.x, 5);
    expect(restoredWorld.y).toBeCloseTo(originalWorld.y, 5);
  });

  it('should batch transform flat Float32Array correctly', () => {
    const matrix = createViewportMatrix(100, 200, 10, 0);
    const inFlat = new Float32Array([0, 0, 1, 2, -5, 10]);
    const outFlat = transformPointsFlat(matrix, inFlat);

    expect(outFlat.length).toBe(6);
    expect(outFlat[0]).toBeCloseTo(100, 5);
    expect(outFlat[1]).toBeCloseTo(200, 5);
    expect(outFlat[2]).toBeCloseTo(110, 5);
    expect(outFlat[3]).toBeCloseTo(180, 5); // panY - scale * 2 = 200 - 20 = 180
  });

  it('should correctly multiply matrices and preserve identity', () => {
    const m = createViewportMatrix(10, 20, 2, 90);
    const res = multiplyAffineMatrices(m, IDENTITY_MATRIX);
    expect(res.a).toBeCloseTo(m.a, 6);
    expect(res.b).toBeCloseTo(m.b, 6);
    expect(res.c).toBeCloseTo(m.c, 6);
    expect(res.d).toBeCloseTo(m.d, 6);
    expect(res.e).toBeCloseTo(m.e, 6);
    expect(res.f).toBeCloseTo(m.f, 6);
  });

  it('correctly converts Point2D array to Float32Array buffer and back', () => {
    const pts = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    const buf = pointsToBuffer(pts);
    expect(buf.length).toBe(4);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(2);

    const restored = bufferToPoints(buf);
    expect(restored).toEqual(pts);

    // Test buffer translation
    const movedBuf = translatePointsBuffer(buf, 10, 20);
    expect(movedBuf[0]).toBe(11);
    expect(movedBuf[1]).toBe(22);

    // Test buffer rotation 90 deg around (0,0)
    const rotBuf = rotatePointsBuffer(buf, 0, 0, 90);
    expect(rotBuf[0]).toBeCloseTo(-2, 5);
    expect(rotBuf[1]).toBeCloseTo(1, 5);
  });
});
