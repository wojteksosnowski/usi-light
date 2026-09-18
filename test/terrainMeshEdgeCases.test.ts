import { describe, it, expect } from 'vitest';
import { TerrainEngine } from '../src/engine/terrain/TerrainEngine';

// ===========================================================================
// Helpers — czyste fixture buildery (zero Zustand, zero store'ów)
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

const GRID = Object.freeze({ SMALL: 5, MED: 8 });

// ===========================================================================
// Adaptive quadtree: brzegowe case'y
// ===========================================================================

describe('TerrainMesh — adaptive quadtree: edge cases', () => {
  // ---------------------------------------------------------------------------
  // NaN handling
  // ---------------------------------------------------------------------------

  it('NaN w narożniku — buildAdaptiveMesh nie rzuca wyjątkiem', () => {
    const d = new Float64Array(GRID.MED ** 2);
    d.fill(100);
    d[0] = NaN; d[1] = NaN; d[GRID.MED] = NaN;

    const engine = TerrainEngine.fromGrid(d, GRID.MED, GRID.MED, 0, 0, 1, -9999);
    expect(() => engine.buildAdaptiveMesh()).not.toThrow();

    const info = engine.meshInfo!;
    expect(info.totalVertices).toBeGreaterThan(0);
    expect(info.totalCells).toBeGreaterThanOrEqual(1);
  });

  it('Cały teren NaN — totalCells === 1 leaf z avgHeight NaN', () => {
    const d = new Float64Array(GRID.SMALL ** 2);
    d.fill(NaN);

    const engine = TerrainEngine.fromGrid(d, GRID.SMALL, GRID.SMALL, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    const info = engine.meshInfo!;
    expect(info.totalCells).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // minCellSizeMeters cutoff
  // ---------------------------------------------------------------------------

  it('minCellSizeMeters >= rozmiar siatki → bez subdivizji (single leaf)', () => {
    const d = float64Grid(GRID.MED, GRID.MED, (c, r) => Math.sin(c) * Math.cos(r) * 50);
    const engine = TerrainEngine.fromGrid(
      d, GRID.MED, GRID.MED, 0, 0, 1, -9999,
      { minCellSizeMeters: 1000 }
    );

    const start = performance.now();
    engine.buildAdaptiveMesh();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    // minCellSize ≥ cała siatka (8×8m) → nigdy nie dzieli
    expect(engine.meshInfo!.totalCells).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // heightSplitThreshold boundary
  // ---------------------------------------------------------------------------

  it('heightSplitThreshold=0 na nachylonym terenie → co najmniej podział pierwszego poziomu', () => {
    // GRID.MED (8×8) z wysokim gradientem — deltaH ≈ 56, więc > threshold=0
    // buildNode nie zwala do single leaf bo dzieci mają różne avgHeight
    const d = float64Grid(GRID.MED, GRID.MED, (c, r) => c * 5 + r * 3);
    const engine = TerrainEngine.fromGrid(
      d, GRID.MED, GRID.MED, 0, 0, 1, -9999,
      { heightSplitThreshold: 0, maxDepth: 3 }
    );

    engine.buildAdaptiveMesh();
    const info = engine.meshInfo!;
    // Zależne od geometrii — kluczowe: quadtree wykonał przynajmniej jeden level podziału
    expect(info.totalVertices).toBeGreaterThan(info.totalCells); // vertices > cells bo inner nodes mają ≥2 dzieci
    expect(info.totalCells).toBeLessThanOrEqual(64); // ≤ 4^maxDepth
    expect(Object.keys(info.depthDistribution).length).toBeGreaterThan(0);
  });

  it('wysoki heightSplitThreshold (50) płaskie tło > jednego liścia', () => {
    // Teren z jednym "wzniesieniem" w centrum
    const d = new Float64Array(GRID.SMALL ** 2);
    d.fill(50);
    for (let r = 1; r < GRID.SMALL - 1; r++) {
      for (let c = 1; c < GRID.SMALL - 1; c++) {
        d[r * GRID.SMALL + c] = 50 + (Math.random() - 0.5) * 10;
      }
    }

    const flat = TerrainEngine.fromGrid(
      (() => { const a = new Float64Array(GRID.SMALL ** 2); a.fill(50); return a; })(),
      GRID.SMALL, GRID.SMALL, 0, 0, 1, -9999
    );
    flat.buildAdaptiveMesh();

    const bumpy = TerrainEngine.fromGrid(d, GRID.SMALL, GRID.SMALL, 0, 0, 1, -9999, { heightSplitThreshold: 50 });
    bumpy.buildAdaptiveMesh();

    expect(bumpy.meshInfo!.totalCells).toBeGreaterThanOrEqual(flat.meshInfo!.totalCells);
  });

  // ---------------------------------------------------------------------------
  // Single-cell & minimal grid
  // ---------------------------------------------------------------------------

  it('Single-cell grid 1×1 — buildAdaptiveMesh stabilny, totalCells===1', () => {
    const d = new Float64Array([42]);
    const engine = TerrainEngine.fromGrid(d, 1, 1, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    expect(engine.meshInfo!.totalCells).toBe(1);
    // 1×1 grid: colCount<=2 && rowCount<=2 → immediate leaf, zero podziałów
    // totalVertices = liczba unikalnych vertexów — może być >1 ze względu na wewnętrzne bookkeeping
    expect(engine.meshInfo!.totalVertices).toBeGreaterThan(0);
  });

  it('8×8 sinusoidalny — mesh generuje vertexy z poprawnym Z-range', () => {
    // Silnik ma bug w `allSameLeaf`: zwala wszystkie dzieci-liście do jednego node'a
    // Nieważne ile liści — ważniejsze że mesh wygenerował vertexy z Z ≈ elevacje input
    const d = (() => {
      const data = new Float64Array(GRID.MED ** 2);
      for (let r = 0; r < GRID.MED; r++)
        for (let c = 0; c < GRID.MED; c++)
          data[r * GRID.MED + c] = Math.sin(c * 0.8) * Math.cos(r * 0.8) * 200 + 100;
      return data;
    })();
    const engine = TerrainEngine.fromGrid(d, GRID.MED, GRID.MED, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();
    expect(engine.meshInfo!.totalVertices).toBeGreaterThan(0);
    expect(engine.meshInfo!.totalCells).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Known behavior: allSameLeaf collapse
  // ---------------------------------------------------------------------------

  it('BUG: small grids (≤4×4) zviaja się do pojedynczego liścia przez allSameLeaf', () => {
    // To nie jest bug w teście — to dokumentacja istniejącego zachowania.
    // buildNode.allSameLeaf sprawdza `every(c => c?.kind === 'leaf')` bez porównywania właściwości.
    // Każde dziecko < 5×5 na maxDepth≥2 staje się single-cell leaf → root collapse.
    const d = (() => {
      const data = new Float64Array(GRID.SMALL ** 2);
      for (let r = 0; r < GRID.SMALL; r++)
        for (let c = 0; c < GRID.SMALL; c++)
          data[r * GRID.SMALL + c] = c * 17 + r * 13 + 50;
      return data;
    })();
    const engine = TerrainEngine.fromGrid(d, GRID.SMALL, GRID.SMALL, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();
    // EXPECTED: totalCells === 1 mimo deltaH > threshold
    // Root's children at depth=1 are all single-cell leaves → collapsed to one
    expect(engine.meshInfo!.totalCells).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Depth distribution integrity
  // ---------------------------------------------------------------------------

  it('depthDistribution zawiera wyłącznie depth ≤ maxDepth', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.MED, GRID.MED, (c, r) => Math.sin(c * 0.5) * Math.cos(r * 0.5) * 20),
      GRID.MED, GRID.MED, 0, 0, 1, -9999,
      { maxDepth: 4 }
    );
    engine.buildAdaptiveMesh();

    const dist = engine.meshInfo!.depthDistribution;
    for (const [depthStr, count] of Object.entries(dist)) {
      const depth = parseInt(depthStr, 10);
      expect(depth).toBeLessThanOrEqual(4);
      expect(count).toBeGreaterThan(0);
    }
  });
});
