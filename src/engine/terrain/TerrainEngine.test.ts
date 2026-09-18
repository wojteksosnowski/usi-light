import { describe, it, expect } from 'vitest';
import { TerrainEngine } from './TerrainEngine';

/** Helper: creates a Float64Array grid with known elevation pattern. */
function makeGrid(ncols: number, nrows: number, elevFn: (col: number, row: number) => number): Float64Array {
  const data = new Float64Array(ncols * nrows);
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      data[r * ncols + c] = elevFn(c, r);
    }
  }
  return data;
}

// ===========================================================================
// Constructor & fromGrid
// ===========================================================================

describe('TerrainEngine.fromGrid', () => {
  it('creates engine with correct dimensions', () => {
    const data = makeGrid(5, 5, (c, r) => 100);
    const engine = TerrainEngine.fromGrid(data, 5, 5, 0, 0, 1, -9999);

    expect(engine.cols).toBe(5);
    expect(engine.rows).toBe(5);
    expect(engine.originX).toBe(0);
    expect(engine.originY).toBe(0);
    expect(engine.cellSize).toBe(1);
    expect(engine.noDataValue).toBe(-9999);
  });

  it('supports custom origin offset', () => {
    const data = makeGrid(3, 3, (c, r) => 50 + c);
    const engine = TerrainEngine.fromGrid(data, 3, 3, 1000, 2000, 10, -9999);

    expect(engine.originX).toBe(1000);
    expect(engine.originY).toBe(2000);
    expect(engine.cellSize).toBe(10);
  });

  it('handles nodata correctly in resulting mesh Z range', () => {
    // Grid where center is nodata
    const data = new Float64Array([100, 100, 100, 100, NaN, 100, 100, 100, 100]);
    const engine = TerrainEngine.fromGrid(data, 3, 3, 0, 0, 1, NaN);
    engine.buildAdaptiveMesh();

    if (engine.meshInfo && engine.meshInfo.totalVertices > 0) {
      const zValues = new Set<number>();
      for (let i = 0; i < engine.meshInfo.totalVertices; i++) {
        zValues.add(engine.meshInfo.vertices[i * 3 + 2]);
      }
      // All Z values should be finite (NaN vertices filtered out in getMeshVertices)
      for (const z of zValues) {
        expect(Number.isFinite(z)).toBe(true);
      }
    }
  });
});

// ===========================================================================
// buildAdaptiveMesh — mesh generation
// ===========================================================================

describe('buildAdaptiveMesh', () => {
  it('generates mesh for uniform flat terrain', () => {
    const data = makeGrid(5, 5, () => 100);
    const engine = TerrainEngine.fromGrid(data, 5, 5, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    expect(engine.meshInfo).not.toBeNull();
    expect(engine.meshInfo!.totalVertices).toBeGreaterThan(0);
    expect(engine.meshInfo!.totalCells).toBeGreaterThan(0);

    // All Z values should be ~100
    const zValues = new Set<number>();
    for (let i = 0; i < engine.meshInfo!.totalVertices; i++) {
      zValues.add(Math.round(engine.meshInfo!.vertices[i * 3 + 2]));
    }
    expect(zValues.size).toBe(1);
    expect(zValues.has(100)).toBe(true);
  });

  it('generates mesh for sloped terrain with increasing Z', () => {
    const cols = 8;
    const rows = 8;
    const data = makeGrid(cols, rows, (c, _r) => 100 + c * 5); // slope along X only
    const engine = TerrainEngine.fromGrid(data, cols, rows, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    expect(engine.meshInfo!.totalVertices).toBeGreaterThan(0);
    expect(engine.meshInfo!.totalCells).toBeGreaterThan(0);

    const minZ = Math.min(...engine.meshInfo!.vertices.filter((_, i) => i % 3 === 2).slice(0, engine.meshInfo!.totalVertices * 3));
    const maxZ = Math.max(...engine.meshInfo!.vertices.filter((_, i) => i % 3 === 2).slice(0, engine.meshInfo!.totalVertices * 3));

    // Min should be near base (100), max near top (100 + 7*5 = 135)
    expect(minZ).toBeGreaterThanOrEqual(99);
    expect(maxZ).toBeLessThanOrEqual(136);
  });

  it('handles NaN corners gracefully without throwing', () => {
    const data = new Float64Array([100, NaN, 100, NaN, NaN, NaN, 100, NaN, 100]);
    const engine = TerrainEngine.fromGrid(data, 3, 3, 0, 0, 1, -9999);
    expect(() => engine.buildAdaptiveMesh()).not.toThrow();

    if (engine.meshInfo) {
      expect(engine.meshInfo!.totalVertices).toBeGreaterThan(0);
    }
  });

  it('single-cell grid produces at least one vertex', () => {
    const data = makeGrid(1, 1, () => 50);
    const engine = TerrainEngine.fromGrid(data, 1, 1, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    // Single cell → leaf node → 1 vertex, 0 triangles (no subdivision)
    expect(engine.meshInfo!.totalVertices).toBeGreaterThanOrEqual(1);
  });

  it('adaptive mesh has more cells than flat terrain for bumpy input', () => {
    // Flat terrain: all same elevation → minimal subdivision
    const flatData = makeGrid(8, 8, () => 100);
    const flatEngine = TerrainEngine.fromGrid(flatData, 8, 8, 0, 0, 1, -9999);
    flatEngine.buildAdaptiveMesh();

    // Bumpy terrain: varying elevation → more subdivision needed
    const bumpData = makeGrid(8, 8, (c, r) => 100 + Math.sin(c * 0.5) * 20 + Math.cos(r * 0.5) * 20);
    const bumpEngine = TerrainEngine.fromGrid(bumpData, 8, 8, 0, 0, 1, -9999);
    bumpEngine.buildAdaptiveMesh();

    // Bumpy terrain should have at least as many triangles as flat
    if (bumpEngine.meshInfo && flatEngine.meshInfo) {
      expect(bumpEngine.meshInfo.totalCells).toBeGreaterThan(flatEngine.meshInfo.totalCells);
    }
  });

  it('drastically reduces cell count for large flat 64x64 terrain (>95% reduction)', () => {
    const cols = 64;
    const rows = 64;
    const flatData = makeGrid(cols, rows, () => 120.0);
    const engine = TerrainEngine.fromGrid(flatData, cols, rows, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh({ heightSplitThreshold: 0.20 });

    const totalTris = engine.getMeshTriangles().length / 9;
    const uncompressedTris = 2 * (cols - 1) * (rows - 1); // 7938 triangles

    // Powinno być co najmniej 95% mniej trójkątów niż w pełnej siatce 1x1
    expect(totalTris).toBeLessThan(uncompressedTris * 0.05);
    expect(engine.meshInfo!.totalVertices).toBeLessThan(100);
  });

  it('buildTinMesh generuje organiczną triangulację Delaunaya wzdłuż warstwic', () => {
    const cols = 20;
    const rows = 20;
    // Teren w kształcie stożka / wzgórza
    const hillData = makeGrid(cols, rows, (c, r) => {
      const dx = c - 10;
      const dy = r - 10;
      return 150 - Math.sqrt(dx * dx + dy * dy) * 4;
    });

    const engine = TerrainEngine.fromGrid(hillData, cols, rows, 0, 0, 1, -9999);
    engine.buildTinMesh({ heightSplitThreshold: 1.0 });

    expect(engine.meshInfo).not.toBeNull();
    expect(engine.meshInfo!.totalVertices).toBeGreaterThan(10);
    expect(engine.meshInfo!.totalCells).toBeGreaterThan(10);

    const edges = engine.getWireframeEdges();
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.length % 4).toBe(0);
  });
});

// ===========================================================================
// getMeshVertices & getMeshTriangles
// ===========================================================================

describe('Mesh getters', () => {
  it('getMeshVertices returns correct structure with all finite values', () => {
    const data = makeGrid(3, 3, (c, r) => 100 + c * 10 + r * 20);
    const engine = TerrainEngine.fromGrid(data, 3, 3, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    const vertices = engine.getMeshVertices();
    expect(vertices.length).toBeGreaterThan(0);

    for (const v of vertices) {
      expect(typeof v.x).toBe('number');
      expect(typeof v.y).toBe('number');
      expect(typeof v.z).toBe('number');
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(Number.isFinite(v.z)).toBe(true);
    }
  });

  it('getMeshTriangles returns valid triangle data (all finite)', () => {
    const data = makeGrid(5, 5, (c, r) => 50 + c * 2 + r * 3);
    const engine = TerrainEngine.fromGrid(data, 5, 5, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    const tris = engine.getMeshTriangles();
    expect(tris.length).toBeGreaterThan(0);
    expect(tris.length % 9).toBe(0); // 9 values per triangle (3 vertices × 3 components)

    for (let i = 0; i < tris.length; i++) {
      expect(Number.isFinite(tris[i])).toBe(true);
    }
  });

  it('Z values match expected elevation range from source data', () => {
    const cols = 6;
    const rows = 6;
    const baseElev = 80;
    const scale = 5;
    const data = makeGrid(cols, rows, (c, r) => baseElev + c * scale + r * scale);
    const engine = TerrainEngine.fromGrid(data, cols, rows, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    const vertices = engine.getMeshVertices();
    if (vertices.length === 0) return;

    const zs = vertices.map((v) => v.z);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const expectedMin = baseElev;
    const expectedMax = baseElev + (cols - 1) * scale + (rows - 1) * scale;

    // Allow ±0.5 tolerance due to averaging in quadtree
    expect(minZ).toBeGreaterThanOrEqual(expectedMin - 0.5);
    expect(maxZ).toBeLessThanOrEqual(expectedMax + 0.5);
  });

  it('mesh with mixed NaN inputs has no NaN in getMeshTriangles result', () => {
    const data = new Float64Array([
      100, NaN, 100,
      NaN, NaN, NaN,
      100, NaN, 100,
    ]);
    const engine = TerrainEngine.fromGrid(data, 3, 3, 0, 0, 1, NaN);
    engine.buildAdaptiveMesh();

    const tris = engine.getMeshTriangles();
    for (let i = 0; i < tris.length; i++) {
      expect(Number.isFinite(tris[i])).toBe(true);
    }
  });
});

// ===========================================================================
// DXF Export
// ===========================================================================

describe('exportMeshAsDxf', () => {
  it('produces valid DXF header + ENTITIES section', () => {
    const data = makeGrid(4, 4, (c, r) => 100 + c + r);
    const engine = TerrainEngine.fromGrid(data, 4, 4, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    const result = engine.exportMeshAsDxf();
    expect(result.type).toBe('dxf');

    const dxf = result.content;
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('ENDSEC');
    expect(dxf).toContain('EOF');
  });

  it('POLYLINE entity has group codes 66=1 and 70=16', () => {
    const data = makeGrid(4, 4, (c, r) => 100);
    const engine = TerrainEngine.fromGrid(data, 4, 4, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    const result = engine.exportMeshAsDxf();
    const lines = result.content.split('\n');

    // Find POLYLINE line index
    let polyIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'POLYLINE') {
        polyIdx = i;
        break;
      }
    }
    expect(polyIdx).toBeGreaterThan(-1);

    // Check groups after POLYLINE
    const found66 = lines.slice(polyIdx + 1, polyIdx + 8).includes('66');
    const found70 = lines.slice(polyIdx + 1, polyIdx + 8).includes('70');
    expect(found66).toBe(true);
    expect(found70).toBe(true);
  });

  it('VERTEX entities have group 10/x, 20/y, 30/z coordinates following VERTEX tag', () => {
    const data = makeGrid(3, 3, (c, r) => 200 + c * 5 + r * 10);
    const engine = TerrainEngine.fromGrid(data, 3, 3, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    const result = engine.exportMeshAsDxf();
    const lines = result.content.split('\n');

    let vertexCount = 0;
    let validVertexCount = 0;

    // Each pair in the array is [groupCode, value]
    for (let i = 0; i < lines.length - 1; i += 2) {
      if (lines[i] !== '0' || lines[i + 1] !== 'VERTEX') continue;
      vertexCount++;

      // Check that a few pairs ahead we find 10/x, 20/y, 30/z pattern
      // After VERTEX: skip layer (8/RZEZBA_TERENU), then find 10/val, 20/val, 30/val
      let found = false;
      for (let j = i + 2; j < Math.min(i + 12, lines.length - 1); j += 2) {
        if (lines[j] === '10' && lines[j + 2] === '20' && lines[j + 4] === '30') {
          found = true;
          break;
        }
        // If we hit another VERTEX or SEQEND before finding, stop
        if (lines[j] === '0' && (lines[j + 1] === 'VERTEX' || lines[j + 1] === 'SEQEND')) break;
      }
      if (found) validVertexCount++;
    }

    expect(vertexCount).toBeGreaterThan(0);
    expect(validVertexCount).toBeGreaterThan(0);
  });

  it('DXF output contains RZEZBA_TERENU layer name', () => {
    const data = makeGrid(3, 3, (c, r) => 100);
    const engine = TerrainEngine.fromGrid(data, 3, 3, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    const result = engine.exportMeshAsDxf();
    expect(result.content).toContain('RZEZBA_TERENU');
  });

  it('exports throw error before mesh is built', () => {
    const data = makeGrid(3, 3, () => 50);
    const engine = TerrainEngine.fromGrid(data, 3, 3, 0, 0, 1, -9999);

    expect(() => engine.exportMeshAsDxf()).toThrow('buildAdaptiveMesh');
    expect(() => engine.exportContoursAsDxf({ interval: 5 })).toThrow('buildAdaptiveMesh');
  });

  it('contour DXF has LWPOLYLINE + TEXT entities', () => {
    const cols = 6;
    const rows = 6;
    const data = makeGrid(cols, rows, (c, r) => 100 + c * 5 + r * 5);
    const engine = TerrainEngine.fromGrid(data, cols, rows, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    const result = engine.exportContoursAsDxf({ interval: 10 });
    const dxf = result.content;

    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('IZOHIPSY_TERENU');
    expect(dxf).toContain('TEXT');
  });

  it('contour DXF text labels contain numeric elevation values like "100.0"', () => {
    const data = makeGrid(4, 4, (c, r) => 50 + c * 10 + r * 10);
    const engine = TerrainEngine.fromGrid(data, 4, 4, 0, 0, 1, -9999);
    engine.buildAdaptiveMesh();

    const result = engine.exportContoursAsDxf({ interval: 10 });
    const dxf = result.content;

    // Look for TEXT content pattern: number with .0 format (elevation label)
    const labelMatch = dxf.match(/^[1]\s+\d+\.\d+$/m);
    expect(labelMatch).not.toBeNull();
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================

describe('Edge cases', () => {
  it('all-nodata grid produces mesh with zero or fallback vertices', () => {
    const data = new Float64Array([NaN, NaN, NaN]);
    const engine = TerrainEngine.fromGrid(data, 2, 2, 0, 0, 1, NaN);
    engine.buildAdaptiveMesh();

    if (engine.meshInfo) {
      expect(engine.meshInfo!.totalVertices).toBeGreaterThanOrEqual(0);
      expect(engine.meshInfo!.totalCells).toBeGreaterThanOrEqual(0);
    }
  });

  it('large grid (16×16) builds mesh without errors', () => {
    const data = makeGrid(16, 16, (c, r) => Math.sin(c / 3) * 20 + Math.cos(r / 3) * 20 + 100);
    const engine = TerrainEngine.fromGrid(data, 16, 16, 0, 0, 1, -9999);
    expect(() => engine.buildAdaptiveMesh()).not.toThrow();

    if (engine.meshInfo) {
      expect(engine.meshInfo!.totalVertices).toBeGreaterThan(1);
      expect(engine.meshInfo!.totalCells).toBeGreaterThan(1);
    }
  });

  it('mixed invalid values produce partial mesh with only valid Z', () => {
    const data = makeGrid(4, 4, (c, r) => (c + r) % 2 === 0 ? 100 : NaN);
    const engine = TerrainEngine.fromGrid(data, 4, 4, 0, 0, 1, NaN);
    engine.buildAdaptiveMesh();

    if (engine.meshInfo) {
      const hasValidZ = [...engine.meshInfo.vertices].some((z, i) => i % 3 === 2 && Number.isFinite(z));
      expect(hasValidZ).toBe(true);
    }
  });
});
