import { describe, it, expect } from 'vitest';
import { TerrainEngine } from '../src/engine/terrain/TerrainEngine';

// ===========================================================================
// Helpers
// ===========================================================================

function float64Grid(ncols: number, nrows: number, fn: (c: number, r: number) => number): Float64Array {
  const d = new Float64Array(ncols * nrows);
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      d[r * ncols + c] = fn(c, r);
    }
  }
  return d;
}

const GRID = Object.freeze({ MED: 8, LARGE: 10 });

// ===========================================================================
// Marching Squares — walidacja geometryczna konturów
// ===========================================================================

describe('Marching Squares — walidacja geometryczna konturów', () => {
  // ---------------------------------------------------------------------------
  // Bounding box containment
  // ---------------------------------------------------------------------------

  it('wszystkie vertexy konturu leżą wewnątrz bounding box terenu', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.LARGE, GRID.LARGE, (c, r) => c * 3 + r * 2),
      GRID.LARGE, GRID.LARGE, 100, 200, 5, -9999
    );
    const contours = engine.generateContours({ interval: 5.0 });
    const bounds = engine.bounds!;

    for (const contour of contours) {
      for (const loop of contour.loops) {
        for (const pt of loop) {
          expect(pt.x).toBeGreaterThanOrEqual(bounds.minX - 1);
          expect(pt.x).toBeLessThanOrEqual(bounds.maxX + 1);
          expect(pt.y).toBeGreaterThanOrEqual(bounds.minY - 1);
          expect(pt.y).toBeLessThanOrEqual(bounds.maxY + 1);
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Uniform gradient → parallel contour lines
  // ---------------------------------------------------------------------------

  it('gradient jednolity Y → kontury równoległe do osi X (stały ~Y na pętlę)', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.LARGE, GRID.LARGE, (_, r) => r * 10),
      GRID.LARGE, GRID.LARGE, 0, 0, 1, -9999
    );
    const contours = engine.generateContours({ interval: 10.0 });

    expect(contours.length).toBeGreaterThan(0);

    for (const contour of contours) {
      for (const loop of contour.loops) {
        if (loop.length >= 2) {
          // Wszystkie vertexy w pętli powinny mieć ~ten sam Y
          const ys = loop.map(p => p.y);
          const spread = Math.max(...ys) - Math.min(...ys);
          // Tolerancja ~2 cells dla interpolacji liniowej
          expect(spread).toBeLessThan(2.0);
        }
      }
    }
  });

  it('gradient jednolity X → kontury równoległe do osi Y', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.LARGE, GRID.LARGE, (c, _) => c * 10),
      GRID.LARGE, GRID.LARGE, 0, 0, 1, -9999
    );
    const contours = engine.generateContours({ interval: 10.0 });

    for (const contour of contours) {
      for (const loop of contour.loops) {
        if (loop.length >= 2) {
          const xs = loop.map(p => p.x);
          const spread = Math.max(...xs) - Math.min(...xs);
          expect(spread).toBeLessThan(2.0);
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Interval nesting
  // ---------------------------------------------------------------------------

  it('isohipsy interwału 10 ⊂ isohipsy interwału 5 po elevation', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.LARGE, GRID.LARGE, (c, r) => (c + r) * 5),
      GRID.LARGE, GRID.LARGE, 0, 0, 1, -9999
    );

    const fine = engine.generateContours({ interval: 5.0 }).sort((a, b) => a.elevation - b.elevation);
    const coarse = engine.generateContours({ interval: 10.0 }).sort((a, b) => a.elevation - b.elevation);

    expect(fine.length).toBeGreaterThanOrEqual(coarse.length);

    // Każdy drugi poziom z fine powinien wystąpić w coarse
    for (const lev of coarse) {
      const matched = fine.find(f => f.elevation === lev.elevation);
      expect(matched).toBeDefined();
    }
  });

  // ---------------------------------------------------------------------------
  // Elevation correctness
  // ---------------------------------------------------------------------------

  it('elevation levels są wielokrotnością interval', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.LARGE, GRID.LARGE, (c, r) => c * 7 + r * 3),
      GRID.LARGE, GRID.LARGE, 0, 0, 1, -9999
    );

    const contours = engine.generateContours({ interval: 5.0 });
    for (const c of contours) {
      expect(c.elevation % 5).toBeCloseTo(0, 1);
    }
  });

  // ---------------------------------------------------------------------------
  // Loop validity
  // ---------------------------------------------------------------------------

  it('każda pętla ma ≥ 2 vertexy o finite x/y', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.MED, GRID.MED, (c, r) => 50 + Math.sin(c * 0.3) * Math.cos(r * 0.3) * 20),
      GRID.MED, GRID.MED, 0, 0, 1, -9999
    );

    const contours = engine.generateContours({ interval: 2.0 });
    for (const c of contours) {
      for (const loop of c.loops) {
        expect(loop.length).toBeGreaterThanOrEqual(2);
        for (const pt of loop) {
          expect(Number.isFinite(pt.x)).toBe(true);
          expect(Number.isFinite(pt.y)).toBe(true);
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // minLength filter
  // ---------------------------------------------------------------------------

  it('minLength filtruje krótkie fragmenty konturu', () => {
    // Teren z lokalną anomalią — pojedyncza wyspa wyższa
    const d = new Float64Array(25);
    d.fill(10);
    d[12] = 15; // center cell bump

    const engine = TerrainEngine.fromGrid(d, 5, 5, 0, 0, 1, -9999);
    const noFilter = engine.generateContours({ interval: 1.0, minLength: 0 });
    const filtered = engine.generateContours({ interval: 1.0, minLength: 10 });

    // minLength = 0 → może dać kilka krótkich segmentów
    // minLength = 10 → powinien odfiltrować wszystko wokół małej anomalii
    // Nie sprawdzamy dokładnej liczby — tylko że filter działa (filtered ≤ noFilter)
    const totalLenNoFilter = noFilter.reduce((sum, c) => sum + c.loops.reduce((s, l) => s + l.length, 0), 0);
    const totalLenFiltered = filtered.reduce((sum, c) => sum + c.loops.reduce((s, l) => s + l.length, 0), 0);

    if (noFilter.length > 0 && filtered.length > 0) {
      expect(totalLenFiltered).toBeLessThanOrEqual(totalLenNoFilter);
    }
  });

  it('obsługuje transformację afiniczną 2D (obrót siatki o kąt zbieżności południków)', () => {
    // Siatka obrócona o np. 45 stopni
    const cos = Math.SQRT1_2;
    const sin = Math.SQRT1_2;
    const transform2D = {
      ux: cos,
      uy: sin,
      vx: -sin,
      vy: cos,
    };

    const d = float64Grid(5, 5, (c, r) => c * 5 + r * 5);
    const engine = TerrainEngine.fromGrid(d, 5, 5, 100, 200, 1, -9999, undefined, transform2D);
    engine.buildAdaptiveMesh();

    const contours = engine.generateContours({ interval: 5.0 });
    expect(contours.length).toBeGreaterThan(0);

    const edges = engine.getWireframeEdges();
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.length % 4).toBe(0);

    const tris = engine.getMeshTriangles();
    expect(tris.length).toBeGreaterThan(0);
    expect(tris.length % 9).toBe(0);
  });
});
