import { describe, it, expect } from 'vitest';
import { TerrainEngine } from '../src/engine/terrain/TerrainEngine';
import { parseDxfWithMetadata } from '../src/utils/dxfParser';

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

/** Extract group-30 Z-values from DXF text (group code 30 = Z coordinate). */
function extractGroup30Values(dxf: string): number[] {
  const lines = dxf.split('\n');
  const vals: number[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim() === '30') {
      const z = parseFloat(lines[i + 1].trim());
      if (Number.isFinite(z)) vals.push(z);
    }
  }
  return vals;
}

const GRID = Object.freeze({ MED: 6, LARGE: 8 });

// ===========================================================================
// DXF Mesh Export — structural validation + roundtrip attempt
// ===========================================================================

describe('DXF Roundtrip — exportMeshAsDxf struktura i parsowanie', () => {
  // ---------------------------------------------------------------------------
  // Section structure
  // ---------------------------------------------------------------------------

  it('exportMeshAsDxf: pełna struktura sekcji + entitie + RZEZBA_TERENU', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.MED, GRID.MED, (c, r) => 50 + c * 2 + r * 3),
      GRID.MED, GRID.MED, 0, 0, 1, -9999
    );
    engine.buildAdaptiveMesh();

    const result = engine.exportMeshAsDxf();
    expect(result.type).toBe('dxf');
    const dxf = result.content as string;

    // Sekcje
    const sections = dxf.match(/^SECTION$/gm);
    expect(sections).toBeTruthy();
    expect(sections!.length).toBeGreaterThanOrEqual(1);

    // ENTITIES
    expect(dxf).toContain('ENTITIES');

    // POLYLINE + VERTEX + SEQEND
    const polylines = dxf.match(/^POLYLINE$/gm);
    expect(polylines).toBeTruthy();
    expect(polylines!.length).toBe(1);

    const vertices = dxf.match(/^VERTEX$/gm);
    expect(vertices).toBeTruthy();
    expect(vertices!.length).toBeGreaterThan(0);

    const seqends = dxf.match(/^SEQEND$/gm);
    expect(seqends).toBeTruthy();
    expect(seqends!.length).toBe(1);

    // Layer
    expect(dxf).toContain('RZEZBA_TERENU');
  });

  // ---------------------------------------------------------------------------
  // Group codes presence
  // ---------------------------------------------------------------------------

  it('DXF mesh: grupy 10/x, 20/y, 30/z obecne przy VERTEX', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.MED, GRID.MED, (c, r) => 100 + c * 2 + r * 3),
      GRID.MED, GRID.MED, 0, 0, 1, -9999
    );
    engine.buildAdaptiveMesh();

    const dxf = engine.exportMeshAsDxf().content as string;

    // Współrzędne X (group 10), Y (group 20), Z (group 30)
    const xMatches = dxf.match(/^\s*10\s+[\d.\-]+/gm);
    const yMatches = dxf.match(/^\s*20\s+[\d.\-]+/gm);
    const zMatches = dxf.match(/^\s*30\s+[\d.\-]+/gm);

    expect(xMatches).toBeTruthy();
    expect(yMatches).toBeTruthy();
    expect(zMatches).toBeTruthy();

    // Liczba grup = liczba vertexów × 3
    expect(xMatches!.length).toBeGreaterThan(0);
    expect(yMatches!.length).toBe(xMatches!.length);
    expect(zMatches!.length).toBe(xMatches!.length);
  });

  // ---------------------------------------------------------------------------
  // Z-coordinate range integrity
  // ---------------------------------------------------------------------------

  it('mesh o znanej geometrii: Z values w zakresie [base, base+maxDelta]', () => {
    const base = 100;
    const sz = GRID.MED;
    const engine = TerrainEngine.fromGrid(
      float64Grid(sz, sz, (c, r) => base + c * 2 + r * 3),
      sz, sz, 0, 0, 1, -9999
    );
    engine.buildAdaptiveMesh();

    const dxf = engine.exportMeshAsDxf().content as string;
    const zValues = extractGroup30Values(dxf);

    expect(zValues.length).toBeGreaterThan(0);

    const minZ = Math.min(...zValues);
    const maxZ = Math.max(...zValues);
    const expectedMax = base + (sz - 1) * 2 + (sz - 1) * 3;

    expect(minZ).toBeGreaterThanOrEqual(base - 0.5);
    expect(maxZ).toBeLessThanOrEqual(expectedMax + 0.5);
  });

  // ---------------------------------------------------------------------------
  // DXF roundtrip via parseDxfWithMetadata
  // ---------------------------------------------------------------------------

  it('parseDxfWithMetadata parsuje eksportowany mesh DXF bez rzucania wyjątku', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.MED, GRID.MED, (c, r) => 50 + c * 3 + r * 2),
      GRID.MED, GRID.MED, 500000, 5400000, 10, -9999
    );
    engine.buildAdaptiveMesh();

    const dxf = engine.exportMeshAsDxf().content as string;

    // Parser może lub nie może wyciągnąć POLYLINE mesh jako BuildingLoop
    // W każdym razie — nie rzuca wyjątkiem
    expect(() => parseDxfWithMetadata(dxf)).not.toThrow();
  });

  it('parseDxfWithMetadata(zwraca .buildings Array)', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.MED, GRID.MED, (c, r) => c + r),
      GRID.MED, GRID.MED, 0, 0, 1, -9999
    );
    engine.buildAdaptiveMesh();

    const dxf = engine.exportMeshAsDxf().content as string;
    const parsed = parseDxfWithMetadata(dxf);

    expect(Array.isArray(parsed.buildings)).toBe(true);
    // parseDxfWithMetadata parsuje LWPOLYLINE/POLYLINE/HATCH
    // POLYFACE/MESH z group 70=16 może nie być wyciągnięte — OK
    // Główny cel testu: brak exception
    if (parsed.buildings.length > 0) {
      for (const bldg of parsed.buildings) {
        expect(Array.isArray(bldg.vertices)).toBe(true);
        for (const v of bldg.vertices) {
          expect(typeof v.x).toBe('number');
          expect(typeof v.y).toBe('number');
          expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Contour DXF roundtrip
  // ---------------------------------------------------------------------------

  it('exportContoursAsDxf: LWPOLYLINE + TEXT labels w strukturze', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.LARGE, GRID.LARGE, (c, r) => 50 + c * 5 + r * 5),
      GRID.LARGE, GRID.LARGE, 0, 0, 1, -9999
    );

    const result = engine.exportContoursAsDxf({ interval: 10.0 });
    expect(result.type).toBe('dxf');
    const dxf = result.content as string;

    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('IZOHIPSY_TERENU');

    // Tekst z elevacją
    const textMatches = dxf.match(/^TEXT$/gm);
    expect(textMatches).toBeTruthy();
  });

  it('contour DXF → parseDxfWithMetadata nie rzuca wyjątkiem', () => {
    const engine = TerrainEngine.fromGrid(
      float64Grid(GRID.MED, GRID.MED, (c, r) => 30 + c * 8 + r * 8),
      GRID.MED, GRID.MED, 0, 0, 1, -9999
    );

    const dxf = engine.exportContoursAsDxf({ interval: 5.0 }).content as string;

    // Parser może nie wyciągnąć LWPOLYLINE jako BuildingLoop
    // Ale nie rzuca wyjątkiem
    expect(() => parseDxfWithMetadata(dxf)).not.toThrow();

    const parsed = parseDxfWithMetadata(dxf);
    expect(Array.isArray(parsed.buildings)).toBe(true);
  });
});
