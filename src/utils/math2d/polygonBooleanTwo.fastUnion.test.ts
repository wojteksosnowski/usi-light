import { describe, it, expect, beforeEach } from 'vitest';
import polygonClipping from 'polygon-clipping';
import {
  fastUnionTwoSimpleLoops,
  resetFastUnionTelemetry,
  getFastUnionTelemetry,
} from './polygonBooleanTwo';
import {
  calculateSignedArea,
  polygonsWithHolesToClipping,
  clippingResultToPolygonsWithHoles,
} from './polygons';
import { Point2D } from '../../types/geometry';

/**
 * Differential regression tests for the specific fallback-triggering geometries
 * identified while auditing why `fastUnionTwoSimpleLoops` falls back to the generic
 * polygon-clipping union: shared/collinear edges, near-duplicate vertices, near-collinear
 * kinks, near-touching parallel edges, and a hole loop whose first vertex sits near the
 * outer boundary. Each case asserts the fast path (a) does not fall back and (b) produces
 * a result geometrically equivalent (net area) to the ground-truth polygon-clipping union.
 */
function groundTruthUnion(polyA: Point2D[], polyB: Point2D[]): { outer: Point2D[]; holes: Point2D[][] }[] {
  const cPolys = polygonsWithHolesToClipping([
    { outer: polyA, holes: [] },
    { outer: polyB, holes: [] },
  ]);
  const unionRes = polygonClipping.union(cPolys[0], cPolys[1]);
  return clippingResultToPolygonsWithHoles(unionRes);
}

function netArea(polys: { outer: Point2D[]; holes: Point2D[][] }[]): number {
  let total = 0;
  for (const p of polys) {
    let a = Math.abs(calculateSignedArea(p.outer));
    for (const h of p.holes || []) a -= Math.abs(calculateSignedArea(h));
    total += a;
  }
  return total;
}

describe('fastUnionTwoSimpleLoops - fallback-trigger regression (differential vs polygon-clipping)', () => {
  beforeEach(() => {
    resetFastUnionTelemetry();
  });

  it('shared full edge between two adjacent rectangles', () => {
    const polyA: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const polyB: Point2D[] = [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ];

    const res = fastUnionTwoSimpleLoops(polyA, polyB);
    expect(res).not.toBeNull();
    expect(getFastUnionTelemetry().fallbackCalls).toBe(0);

    const truth = groundTruthUnion(polyA, polyB);
    expect(Math.abs(polyArea(res!) - netArea(truth))).toBeLessThan(1e-3);
  });

  it('near-duplicate vertex (offset within snap tolerance, not exactly equal)', () => {
    const polyA: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const polyB: Point2D[] = [
      // Corner offset by 5e-4 from polyA's (10,10) corner — within SNAP_TOL (1e-3) but not identical.
      { x: 10.0005, y: 9.9997 },
      { x: 20, y: 5 },
      { x: 20, y: 15 },
      { x: 10, y: 15 },
    ];

    const res = fastUnionTwoSimpleLoops(polyA, polyB);
    expect(res).not.toBeNull();
    expect(getFastUnionTelemetry().fallbackCalls).toBe(0);

    const truth = groundTruthUnion(polyA, polyB);
    expect(Math.abs(polyArea(res!) - netArea(truth))).toBeLessThan(1e-1);
  });

  it('near-collinear kink (vertex offset ~1e-8 from perfectly collinear)', () => {
    const polyA: Point2D[] = [
      { x: 0, y: 0 },
      { x: 5, y: 1e-8 }, // near-collinear kink on an otherwise straight bottom edge
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const polyB: Point2D[] = [
      { x: 5, y: 0 },
      { x: 15, y: 0 },
      { x: 15, y: 10 },
      { x: 5, y: 10 },
    ];

    const res = fastUnionTwoSimpleLoops(polyA, polyB);
    expect(res).not.toBeNull();
    expect(getFastUnionTelemetry().fallbackCalls).toBe(0);

    const truth = groundTruthUnion(polyA, polyB);
    expect(Math.abs(polyArea(res!) - netArea(truth))).toBeLessThan(1);
  });

  it('near-touching parallel edges separated by a sub-tolerance gap', () => {
    const polyA: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const polyB: Point2D[] = [
      // Left edge at x=10 + 5e-7 (sub-EPSILON gap, i.e. numerically touching within the
      // top-level AABB tolerance) instead of touching exactly at x=10.
      { x: 10.0000005, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10.0000005, y: 10 },
    ];

    const res = fastUnionTwoSimpleLoops(polyA, polyB);
    expect(res).not.toBeNull();
    expect(getFastUnionTelemetry().fallbackCalls).toBe(0);

    const truth = groundTruthUnion(polyA, polyB);
    expect(Math.abs(polyArea(res!) - netArea(truth))).toBeLessThan(1e-1);
  });

  it('hole loop whose first vertex sits within snap tolerance of the outer boundary', () => {
    // Two C-shaped brackets that join into a donut (from polygonBooleanTwo.test.ts),
    // but with the hole's first vertex nudged to sit almost exactly on the outer ring.
    const cTop: Point2D[] = [
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 20, y: 20 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
      { x: 0, y: 30 },
    ];
    const cBottom: Point2D[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
      { x: 20, y: 20 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];

    const res = fastUnionTwoSimpleLoops(cTop, cBottom);
    expect(res).not.toBeNull();
    expect(res!.holes.length).toBeGreaterThanOrEqual(1);
    expect(getFastUnionTelemetry().fallbackCalls).toBe(0);

    const truth = groundTruthUnion(cTop, cBottom);
    expect(Math.abs(polyArea(res!) - netArea(truth))).toBeLessThan(1);
  });
});

function polyArea(res: { outer: Point2D[]; holes: Point2D[][] }): number {
  let a = Math.abs(calculateSignedArea(res.outer));
  for (const h of res.holes || []) a -= Math.abs(calculateSignedArea(h));
  return a;
}
