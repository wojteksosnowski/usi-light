import { describe, it, expect } from 'vitest';
import polygonClipping from 'polygon-clipping';
import {
  fastUnionTwoSimpleLoops,
  fastUnionTwoPolygonsWithHoles,
  fastDifferenceTwoSimpleLoops,
  findSegmentIntersection,
  getFastDifferenceTelemetry,
  resetFastDifferenceTelemetry,
} from './polygonBooleanTwo';
import { Point2D } from '../../types/geometry';
import { calculateSignedArea, toNormalizedClippingRing, clippingResultToPolygonsWithHoles } from './polygons';

function totalAbsArea(pieces: { outer: Point2D[]; holes: Point2D[][] }[]): number {
  let sum = 0;
  for (const p of pieces) {
    sum += Math.abs(calculateSignedArea(p.outer));
    for (const h of p.holes) sum -= Math.abs(calculateSignedArea(h));
  }
  return sum;
}

/** Ground truth via polygon-clipping.difference, for cross-checking fastDifferenceTwoSimpleLoops. */
function groundTruthDifferenceArea(polyA: Point2D[], polyB: Point2D[]): number {
  const ringA = toNormalizedClippingRing(polyA, 1000);
  const ringB = toNormalizedClippingRing(polyB, 1000);
  if (!ringA || !ringB) return 0;
  const diffRes = polygonClipping.difference([ringA], [ringB]);
  const pwhList = clippingResultToPolygonsWithHoles(diffRes);
  let sum = 0;
  for (const p of pwhList) {
    sum += Math.abs(calculateSignedArea(p.outer));
    for (const h of p.holes || []) sum -= Math.abs(calculateSignedArea(h));
  }
  return sum;
}

describe('polygonBooleanTwo - Fast 2-Polygon Boolean Union', () => {
  describe('Segment Intersections', () => {
    it('detects simple cross intersection between two orthogonal segments', () => {
      const p1 = { x: 0, y: 5 };
      const p2 = { x: 10, y: 5 };
      const q1 = { x: 5, y: 0 };
      const q2 = { x: 5, y: 10 };

      const res = findSegmentIntersection(p1, p2, q1, q2);
      expect(res).toBeDefined();
      expect(res?.point.x).toBeCloseTo(5);
      expect(res?.point.y).toBeCloseTo(5);
      expect(res?.t).toBeCloseTo(0.5);
      expect(res?.u).toBeCloseTo(0.5);
    });

    it('returns null for parallel or non-intersecting segments', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 0 };
      const q1 = { x: 0, y: 5 };
      const q2 = { x: 10, y: 5 };

      expect(findSegmentIntersection(p1, p2, q1, q2)).toBeNull();
    });
  });

  describe('fastUnionTwoSimpleLoops - Basic & Overlapping Shapes', () => {
    it('unions two partially overlapping rectangles', () => {
      const polyA: Point2D[] = [
        { x: 0, y: 0 },
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
      expect(res).toBeDefined();
      expect(res?.outer.length).toBeGreaterThanOrEqual(4);
      expect(calculateSignedArea(res!.outer)).toBeCloseTo(150, 0); // 100 + 100 - 50 = 150 m2
      expect(res?.holes.length).toBe(0);
    });

    it('handles full containment where polyA is inside polyB', () => {
      const inner: Point2D[] = [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 4 },
        { x: 2, y: 4 },
      ];
      const outer: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const res = fastUnionTwoSimpleLoops(inner, outer);
      expect(res).toBeDefined();
      expect(res?.outer).toEqual(outer);
      expect(res?.holes.length).toBe(0);
    });

    it('returns null for disjoint polygons', () => {
      const polyA: Point2D[] = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
        { x: 0, y: 5 },
      ];
      const polyB: Point2D[] = [
        { x: 20, y: 0 },
        { x: 25, y: 0 },
        { x: 25, y: 5 },
        { x: 20, y: 5 },
      ];

      const res = fastUnionTwoSimpleLoops(polyA, polyB);
      expect(res).toBeNull();
    });
  });

  describe('Hole creation from two C-shaped polygons', () => {
    it('creates an internal hole when two C-shaped polygons join to form a donut', () => {
      // Shape A: Top C bracket
      // [0, 10] to [30, 30] with a cutout at bottom center [10, 10] to [20, 20]
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

      // Shape B: Bottom C bracket
      // [0, 0] to [30, 20] overlapping with the legs of cTop
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
      expect(res).toBeDefined();
      expect(res?.outer).toBeDefined();
      expect(res?.holes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('fastUnionTwoPolygonsWithHoles - Advanced Hole Handling', () => {
    it('preserves an external hole that does not intersect the joining polygon', () => {
      const polyWithHole = {
        outer: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        holes: [
          [
            { x: 2, y: 2 },
            { x: 6, y: 2 },
            { x: 6, y: 6 },
            { x: 2, y: 6 },
          ],
        ],
      };

      const polyB = {
        outer: [
          { x: 15, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 20 },
          { x: 15, y: 20 },
        ],
        holes: [],
      };

      const res = fastUnionTwoPolygonsWithHoles(polyWithHole, polyB);
      expect(res.success).toBe(true);
      expect(res.result).toBeDefined();
      expect(res.result![0].holes.length).toBe(1);
    });

    it('floods/removes a hole when polyB completely covers it with solid mass', () => {
      const polyWithHole = {
        outer: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        holes: [
          [
            { x: 12, y: 2 },
            { x: 16, y: 2 },
            { x: 16, y: 6 },
            { x: 12, y: 6 },
          ],
        ],
      };

      // PolyB covers [10, 0] to [30, 20] completely covering the hole at [12..16, 2..6]
      const polyB = {
        outer: [
          { x: 10, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 20 },
          { x: 10, y: 20 },
        ],
        holes: [],
      };

      const res = fastUnionTwoPolygonsWithHoles(polyWithHole, polyB);
      expect(res.success).toBe(true);
      expect(res.result![0].holes.length).toBe(0);
    });

    it('preserves hole when both polygons have overlapping holes at the same position', () => {
      const hole = [
        { x: 12, y: 2 },
        { x: 16, y: 2 },
        { x: 16, y: 6 },
        { x: 12, y: 6 },
      ];

      const polyA = {
        outer: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        holes: [hole],
      };

      const polyB = {
        outer: [
          { x: 10, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 20 },
          { x: 10, y: 20 },
        ],
        holes: [hole],
      };

      const res = fastUnionTwoPolygonsWithHoles(polyA, polyB);
      expect(res.success).toBe(true);
      expect(res.result![0].holes.length).toBe(1);
    });
  });

  describe('fastDifferenceTwoSimpleLoops - A \\ B (difference analogue of fastUnionTwoSimpleLoops)', () => {
    const squareA: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    it('returns A unchanged when B is AABB-disjoint from A', () => {
      const polyB: Point2D[] = [
        { x: 20, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 30 },
        { x: 20, y: 30 },
      ];
      const res = fastDifferenceTwoSimpleLoops(squareA, polyB);
      expect(res).not.toBeNull();
      expect(res!.length).toBe(1);
      expect(res![0].holes.length).toBe(0);
      expect(Math.abs(calculateSignedArea(res![0].outer))).toBeCloseTo(100, 6);
    });

    it('returns empty array when A is fully inside B', () => {
      const bigB: Point2D[] = [
        { x: -5, y: -5 },
        { x: 15, y: -5 },
        { x: 15, y: 15 },
        { x: -5, y: 15 },
      ];
      const res = fastDifferenceTwoSimpleLoops(squareA, bigB);
      expect(res).toEqual([]);
    });

    it('creates a donut hole when B is fully inside A without touching the boundary', () => {
      const innerB: Point2D[] = [
        { x: 3, y: 3 },
        { x: 7, y: 3 },
        { x: 7, y: 7 },
        { x: 3, y: 7 },
      ];
      const res = fastDifferenceTwoSimpleLoops(squareA, innerB);
      expect(res).not.toBeNull();
      expect(res!.length).toBe(1);
      expect(res![0].holes.length).toBe(1);
      expect(Math.abs(calculateSignedArea(res![0].outer))).toBeCloseTo(100, 6);
      expect(Math.abs(calculateSignedArea(res![0].holes[0]))).toBeCloseTo(16, 6);
      expect(totalAbsArea(res!)).toBeCloseTo(84, 6);
    });

    it('bites a corner off A when B partially overlaps one edge', () => {
      const cornerB: Point2D[] = [
        { x: -2, y: -2 },
        { x: 4, y: -2 },
        { x: 4, y: 4 },
        { x: -2, y: 4 },
      ];
      const res = fastDifferenceTwoSimpleLoops(squareA, cornerB);
      expect(res).not.toBeNull();
      expect(res!.length).toBe(1);
      expect(res![0].holes.length).toBe(0);
      expect(totalAbsArea(res!)).toBeCloseTo(100 - 16, 6); // 4x4 corner bite removed
      expect(totalAbsArea(res!)).toBeCloseTo(groundTruthDifferenceArea(squareA, cornerB), 3);
    });

    it('splits A into two disjoint pieces when B cuts all the way through', () => {
      const splittingB: Point2D[] = [
        { x: 4, y: -2 },
        { x: 6, y: -2 },
        { x: 6, y: 12 },
        { x: 4, y: 12 },
      ];
      const res = fastDifferenceTwoSimpleLoops(squareA, splittingB);
      expect(res).not.toBeNull();
      expect(res!.length).toBe(2);
      for (const piece of res!) expect(piece.holes.length).toBe(0);
      expect(totalAbsArea(res!)).toBeCloseTo(100 - 20, 6); // two 4x10 strips left after removing the 2x10 middle
      expect(totalAbsArea(res!)).toBeCloseTo(groundTruthDifferenceArea(squareA, splittingB), 3);
    });

    it('handles a touching (flush, non-crossing) shared edge without spurious geometry', () => {
      const flushB: Point2D[] = [
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 10, y: 10 },
      ];
      const res = fastDifferenceTwoSimpleLoops(squareA, flushB);
      expect(res).not.toBeNull();
      expect(totalAbsArea(res!)).toBeCloseTo(100, 3); // B only touches A's edge, doesn't remove any area
    });

    it('matches polygon-clipping ground truth area on a batch of randomized overlapping rectangles', () => {
      resetFastDifferenceTelemetry();
      let seed = 42;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      for (let i = 0; i < 30; i++) {
        const ax = rand() * 20, ay = rand() * 20;
        const aw = 5 + rand() * 10, ah = 5 + rand() * 10;
        const polyA: Point2D[] = [
          { x: ax, y: ay }, { x: ax + aw, y: ay }, { x: ax + aw, y: ay + ah }, { x: ax, y: ay + ah },
        ];
        const bx = rand() * 20, by = rand() * 20;
        const bw = 5 + rand() * 10, bh = 5 + rand() * 10;
        const polyB: Point2D[] = [
          { x: bx, y: by }, { x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, { x: bx, y: by + bh },
        ];

        const res = fastDifferenceTwoSimpleLoops(polyA, polyB);
        expect(res).not.toBeNull();
        const fastArea = totalAbsArea(res!);
        const truthArea = groundTruthDifferenceArea(polyA, polyB);
        // Relative tolerance (0.1%, same convention as umbraA456's real-scene regression
        // checks) rather than a fixed decimal-place check: randomized non-integer vertex
        // coordinates legitimately hit last-bit floating differences between the two
        // independent algorithms (graph-trace vs sweep-line) at this input scale.
        const relTolerance = Math.max(0.01, truthArea * 0.001);
        expect(Math.abs(fastArea - truthArea)).toBeLessThan(relTolerance);
      }

      const t = getFastDifferenceTelemetry();
      console.log(
        `\n[fastDifferenceTwoSimpleLoops telemetry, 30 randomized pairs] totalCalls=${t.totalCalls} ` +
        `fastPathSuccess=${t.fastPathSuccess} fallbackCalls=${t.fallbackCalls} ` +
        `disjointExits=${t.disjointExits} aFullyConsumedExits=${t.aFullyConsumedExits} holeExits=${t.holeExits}\n`
      );
      // Sanity: the graph-trace path must actually be exercised, not silently
      // falling back to polygon-clipping on every call.
      expect(t.fastPathSuccess).toBeGreaterThan(0);
    });
  });
});
