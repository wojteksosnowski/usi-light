import { describe, it, expect } from 'vitest';
import {
  createCachedLineEquation,
  buildLineBufferForPolygon,
  translateLineBuffer,
  rotateLineBuffer,
  updateVertexInLineBuffer,
  distancePointToLine,
  projectPointToLine,
  intersectLines,
  normalizeAnglePi,
  angleDiffPi,
} from './lineBufferEngine';

describe('lineBufferEngine', () => {
  it('creates normalized line equation with A^2 + B^2 = 1', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 10, y: 0 };
    const line = createCachedLineEquation('e1', 'b1', 0, p1, p2);

    expect(line.length).toBeCloseTo(10);
    expect(line.uX).toBeCloseTo(1);
    expect(line.uY).toBeCloseTo(0);
    // Line y = 0 -> 0*x + 1*y + 0 = 0
    expect(line.A * line.A + line.B * line.B).toBeCloseTo(1);
    expect(line.A).toBeCloseTo(0);
    expect(line.B).toBeCloseTo(1);
    expect(line.C).toBeCloseTo(0);
  });

  it('correctly calculates perpendicular distance and orthogonal projection', () => {
    const p1 = { x: 0, y: 5 };
    const p2 = { x: 10, y: 5 };
    const line = createCachedLineEquation('e1', 'b1', 0, p1, p2);

    const testPoint = { x: 3, y: 8 };
    const dist = distancePointToLine(testPoint, line);
    expect(dist).toBeCloseTo(3);

    const proj = projectPointToLine(testPoint, line);
    expect(proj.projectedPoint.x).toBeCloseTo(3);
    expect(proj.projectedPoint.y).toBeCloseTo(5);
    expect(proj.isOnSegment).toBe(true);
    expect(proj.t).toBeCloseTo(3);
  });

  it('distinguishes segment bounds and extension (t < 0 and t > L)', () => {
    const p1 = { x: 2, y: 2 };
    const p2 = { x: 6, y: 2 };
    const line = createCachedLineEquation('e1', 'b1', 0, p1, p2);

    const beforeP1 = { x: 0, y: 4 };
    const projBefore = projectPointToLine(beforeP1, line);
    expect(projBefore.isOnSegment).toBe(false);
    expect(projBefore.t).toBeLessThan(0);

    const afterP2 = { x: 8, y: 4 };
    const projAfter = projectPointToLine(afterP2, line);
    expect(projAfter.isOnSegment).toBe(false);
    expect(projAfter.t).toBeGreaterThan(line.length);
  });

  it('translates line buffer in O(1) updating C and vertices', () => {
    const verts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const buffer = buildLineBufferForPolygon('b1', verts);
    const translated = translateLineBuffer(buffer, 5, -3);

    expect(translated[0].p1).toEqual({ x: 5, y: -3 });
    expect(translated[0].p2).toEqual({ x: 15, y: -3 });

    // Test point on translated line
    const onLinePt = { x: 8, y: -3 };
    expect(distancePointToLine(onLinePt, translated[0])).toBeCloseTo(0);
  });

  it('rotates line buffer in O(1) updating normal vector and C', () => {
    const verts = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const buffer = buildLineBufferForPolygon('b1', verts);
    const pivot = { x: 0, y: 0 };
    const rotated = rotateLineBuffer(buffer, pivot, Math.PI / 2); // 90 deg counter-clockwise

    expect(rotated[0].p1.x).toBeCloseTo(0);
    expect(rotated[0].p1.y).toBeCloseTo(0);
    expect(rotated[0].p2.x).toBeCloseTo(0);
    expect(rotated[0].p2.y).toBeCloseTo(4);

    expect(distancePointToLine({ x: 0, y: 2 }, rotated[0])).toBeCloseTo(0);
  });

  it('updates only affected edges k-1 and k when vertex Vk moves', () => {
    const verts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const buffer = buildLineBufferForPolygon('b1', verts);

    const newVerts = [...verts];
    newVerts[1] = { x: 12, y: 2 }; // move vertex 1

    const updated = updateVertexInLineBuffer(buffer, 'b1', newVerts, 1);

    // Edge 0 (0->1) and Edge 1 (1->2) changed
    expect(updated[0].p2).toEqual({ x: 12, y: 2 });
    expect(updated[1].p1).toEqual({ x: 12, y: 2 });

    // Edge 2 (2->3) and Edge 3 (3->0) unchanged
    expect(updated[2]).toEqual(buffer[2]);
    expect(updated[3]).toEqual(buffer[3]);
  });

  it('intersects two lines using Cramer determinant', () => {
    // Line 1: y = 2 -> 0*x + 1*y - 2 = 0
    const l1 = { A: 0, B: 1, C: -2 };
    // Line 2: x = 5 -> 1*x + 0*y - 5 = 0
    const l2 = { A: 1, B: 0, C: -5 };

    const pt = intersectLines(l1, l2);
    expect(pt).not.toBeNull();
    expect(pt?.x).toBeCloseTo(5);
    expect(pt?.y).toBeCloseTo(2);

    // Parallel lines
    const l3 = { A: 0, B: 1, C: -10 };
    expect(intersectLines(l1, l3)).toBeNull();
  });

  it('computes angular difference in [0, PI)', () => {
    expect(angleDiffPi(0, Math.PI / 4)).toBeCloseTo(Math.PI / 4);
    expect(angleDiffPi(0.1, Math.PI - 0.1)).toBeCloseTo(0.2);
  });
});
