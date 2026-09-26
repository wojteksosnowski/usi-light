import { describe, it, expect } from 'vitest';
import { buildDxfLines } from './dxfExport';
import { rebuildBuildingSegments } from './segmentStatistics';
import { AnalysisPointResult, BuildingLoop, PinnedFacadePoint } from '../types/geometry';

/**
 * Structural integrity checks for the DXF group-code grammar (SECTION/ENDSEC,
 * TABLE/ENDTAB, entry counts). These are checked directly against the DXF spec
 * rather than by round-tripping through our own `dxfParser.ts`, because that
 * reader wraps the permissive `dxf-parser` npm package and does NOT enforce
 * the strict well-formedness that external tools (e.g. AutoCAD) require —
 * it would not have caught the "Error in APPID Table" bug this test guards.
 */

function makeBuilding(overrides: Partial<BuildingLoop> = {}): BuildingLoop {
  return {
    id: 'bldg-1',
    name: 'Test',
    layer: 'L1',
    isTested: true,
    isCityCentre: false,
    buildingType: 'residential',
    defaultHeight: 12,
    hWindowBottom: 0.85,
    vertices: [],
    segments: [],
    transform: { tx: 0, ty: 0, rotationDeg: 0 },
    ...overrides,
  };
}

function pairs(lines: string[]): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (let i = 0; i < lines.length; i += 2) {
    result.push([lines[i], lines[i + 1]]);
  }
  return result;
}

describe('buildDxfLines — DXF structural integrity', () => {
  const outer = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 },
  ];
  const building = rebuildBuildingSegments(makeBuilding(), outer);

  const boundary = rebuildBuildingSegments(
    makeBuilding({ id: 'plot-1', category: 'boundary', isTested: false }),
    [
      { x: -5, y: -5 },
      { x: 20, y: -5 },
      { x: 20, y: 15 },
      { x: -5, y: 15 },
    ],
  );

  const pinnedPoints: PinnedFacadePoint[] = [
    { id: 'pp-1', buildingId: building.id, segmentId: building.segments[0].id, offsetRatio: 0.5, label: 'P1' },
  ];

  const lines = buildDxfLines({
    buildings: [building, boundary],
    pinnedPoints,
  });

  it('produces an even number of lines (every group code has a value)', () => {
    expect(lines.length % 2).toBe(0);
  });

  it('every group code (even index) is a non-empty numeric string', () => {
    for (let i = 0; i < lines.length; i += 2) {
      expect(lines[i]).toMatch(/^\d+$/);
    }
  });

  it('balances SECTION / ENDSEC pairs', () => {
    const entries = pairs(lines);
    let depth = 0;
    let maxDepth = 0;
    entries.forEach(([code, value]) => {
      if (code === '0' && value === 'SECTION') {
        depth += 1;
        maxDepth = Math.max(maxDepth, depth);
      }
      if (code === '0' && value === 'ENDSEC') {
        depth -= 1;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
    });
    expect(depth).toBe(0);
    expect(maxDepth).toBeGreaterThan(0);
  });

  it('balances TABLE / ENDTAB pairs', () => {
    const entries = pairs(lines);
    let depth = 0;
    entries.forEach(([code, value]) => {
      if (code === '0' && value === 'TABLE') depth += 1;
      if (code === '0' && value === 'ENDTAB') {
        depth -= 1;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
    });
    expect(depth).toBe(0);
  });

  it('includes an APPID table with at least one APPID entry (regression: "Error in APPID Table")', () => {
    const tablesStart = lines.indexOf('TABLES');
    const tablesEnd = lines.indexOf('ENDSEC', tablesStart);
    const tablesSection = lines.slice(tablesStart, tablesEnd);

    const appidTableIdx = tablesSection.findIndex((v, i) => v === 'APPID' && tablesSection[i - 1] === '2' && tablesSection[i - 2] === 'TABLE');
    expect(appidTableIdx).toBeGreaterThanOrEqual(0);

    const endtabIdx = tablesSection.indexOf('ENDTAB', appidTableIdx);
    const appidEntrySection = tablesSection.slice(appidTableIdx, endtabIdx);
    const actualCount = appidEntrySection.filter((v, i) => v === 'APPID' && appidEntrySection[i - 1] === '0').length;

    expect(actualCount).toBeGreaterThan(0);
  });

  it('includes a LAYER table with a record for every layer we emit', () => {
    const tablesStart = lines.indexOf('TABLES');
    const tablesEnd = lines.indexOf('ENDSEC', tablesStart);
    const tablesSection = lines.slice(tablesStart, tablesEnd);

    const layerTableIdx = tablesSection.findIndex((v, i) => v === 'LAYER' && tablesSection[i - 1] === '2' && tablesSection[i - 2] === 'TABLE');
    expect(layerTableIdx).toBeGreaterThanOrEqual(0);

    const endtabIdx = tablesSection.indexOf('ENDTAB', layerTableIdx);
    const layerEntrySection = tablesSection.slice(layerTableIdx, endtabIdx);
    const actualCount = layerEntrySection.filter((v, i) => v === 'LAYER' && layerEntrySection[i - 1] === '0').length;

    // Default "0" layer (added automatically by the DXF writer) + our 8: BUDYNKI, BUDYNKI_BADANE,
    // GRANICE_DZIALEK, PUNKTY_POMIARU, RZEZBA_TERENU, ZAKRES_CIENIA_GODZINOWY, ANALIZA_S12, ANALIZA_S56
    expect(actualCount).toBe(9);
  });

  it('ends with exactly one EOF as the final record', () => {
    expect(lines[lines.length - 2]).toBe('0');
    expect(lines[lines.length - 1]).toBe('EOF');

    const eofOccurrences = pairs(lines).filter(([code, value]) => code === '0' && value === 'EOF').length;
    expect(eofOccurrences).toBe(1);
  });

  it('assigns a unique handle (group code 5) to every table record and entity (regression: "Bad handle 0: already in use")', () => {
    const entries = pairs(lines);
    const objectStarts = entries
      .map(([code, value], idx) => ({ code, value, idx }))
      .filter(({ code, value }) =>
        code === '0' &&
        ['APPID', 'LAYER', 'POLYLINE', 'VERTEX', 'SEQEND', 'POINT', 'TEXT', 'LWPOLYLINE'].includes(value),
      );

    const handles: string[] = [];
    objectStarts.forEach(({ idx }) => {
      const [handleCode, handleValue] = entries[idx + 1];
      expect(handleCode).toBe('5');
      expect(handleValue).toBeTruthy();
      handles.push(handleValue);
    });

    expect(handles.length).toBeGreaterThan(0);
    expect(new Set(handles).size).toBe(handles.length);
  });

  it('sets $HANDSEED in the HEADER section past every handle actually used', () => {
    const entries = pairs(lines);
    const handseedIdx = entries.findIndex(([code, value]) => code === '9' && value === '$HANDSEED');
    expect(handseedIdx).toBeGreaterThanOrEqual(0);

    const [handseedCode, handseedValue] = entries[handseedIdx + 1];
    expect(handseedCode).toBe('5');
    const handseed = parseInt(handseedValue, 16);

    const usedHandles = entries
      .filter(([code], i) => code === '5' && i !== handseedIdx + 1)
      .map(([, value]) => parseInt(value, 16));
    expect(usedHandles.length).toBeGreaterThan(0);
    expect(handseed).toBeGreaterThan(Math.max(...usedHandles));
  });

  it('emits real building geometry (LWPOLYLINE) and pinned point (POINT) entities, not placeholders', () => {
    const entries = pairs(lines);
    const vertexCoords = entries
      .filter(([code]) => code === '10')
      .map(([, value]) => Number(value));
    expect(vertexCoords).toContain(0);
    expect(vertexCoords).toContain(10);

    const hasPolyline = entries.some(([code, value]) => code === '0' && value === 'LWPOLYLINE');
    const hasPoint = entries.some(([code, value]) => code === '0' && value === 'POINT');
    expect(hasPolyline).toBe(true);
    expect(hasPoint).toBe(true);
  });
});

describe('buildDxfLines — §12/§56 facade analysis geometry', () => {
  const outer = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 },
  ];
  const building = rebuildBuildingSegments(makeBuilding(), outer);
  const seg = building.segments[0];

  function lwpolylineVertexCounts(lines: string[], layer: string): number[] {
    const entries = pairs(lines);
    const counts: number[] = [];
    let currentLayer: string | null = null;
    let vertexCount = 0;
    let inLwpolyline = false;

    entries.forEach(([code, value]) => {
      if (code === '0') {
        if (inLwpolyline && currentLayer === layer) counts.push(vertexCount);
        inLwpolyline = value === 'LWPOLYLINE';
        vertexCount = 0;
        currentLayer = null;
      } else if (inLwpolyline && code === '8') {
        currentLayer = value;
      } else if (inLwpolyline && code === '10') {
        vertexCount += 1;
      }
    });
    if (inLwpolyline && currentLayer === layer) counts.push(vertexCount);
    return counts;
  }

  function makeResult(id: string): AnalysisPointResult {
    return {
      id,
      point: { x: seg.p1.x + (seg.p2.x - seg.p1.x) * 0.5, y: seg.p1.y + (seg.p2.y - seg.p1.y) * 0.5 },
      normal: seg.normal,
      segmentId: seg.id,
      buildingId: building.id,
      shadowing: {
        point: { x: 5, y: 0 },
        segmentId: seg.id,
        offsetRatio: 0.5,
        isCompliant: true,
        maxContinuousFreeSpanDeg: 156,
        totalFreeSpanDeg: 156,
        sectors: [{ startAngleDeg: -78, endAngleDeg: 78, spanDeg: 156, isFree: true, requiredDistance: 20 }],
        rays: [],
      },
      sunlight: {
        point: { x: 5, y: 0 },
        segmentId: seg.id,
        offsetRatio: 0.5,
        totalMinutes: 240,
        totalHours: 4,
        isCompliant: true,
        timeSlots: [],
        sectors: [{ startAzimuthDeg: 100, endAzimuthDeg: 260, spanDeg: 160, isDirectSunlight: true, requiredDistance: 15, hours: 4 }],
      },
    };
  }

  // Sparse, user-pinned point (P1/P2/P3) — drives only the arc/triangle glyphs.
  const pinnedPointResults: AnalysisPointResult[] = [makeResult('pp-1')];
  // Dense, whole-project auto-sampled dataset (analysisOutput.results) — drives only the bands,
  // and must work independently of any pinned point (this is the bug being fixed here).
  const analysisResults: AnalysisPointResult[] = [makeResult('auto-1')];

  const glyphOnlyLines = buildDxfLines({
    buildings: [building],
    pinnedPoints: [],
    pinnedPointResults,
    analysisResults: [],
  });

  const bandsOnlyLines = buildDxfLines({
    buildings: [building],
    pinnedPoints: [],
    pinnedPointResults: [],
    analysisResults,
  });

  it('exports the §12 sector as an arc (multi-vertex closed LWPOLYLINE) on ANALIZA_S12, from pinnedPointResults alone', () => {
    const counts = lwpolylineVertexCounts(glyphOnlyLines, 'ANALIZA_S12');
    // 1 arc wedge: 9 arc vertices + center = 10
    expect(counts).toContain(10);
  });

  it('exports the §56 sector as a genuine 3-vertex triangle (not an arc) on ANALIZA_S56, from pinnedPointResults alone', () => {
    const counts = lwpolylineVertexCounts(glyphOnlyLines, 'ANALIZA_S56');
    expect(counts).toContain(3);
    expect(counts).not.toContain(10);
  });

  it('exports §12/§56 compliance bands (2-vertex constant-width LWPOLYLINE) from analysisResults alone, with no pinned points', () => {
    const bandCounts12 = lwpolylineVertexCounts(bandsOnlyLines, 'ANALIZA_S12').filter((c) => c === 2);
    const bandCounts56 = lwpolylineVertexCounts(bandsOnlyLines, 'ANALIZA_S56').filter((c) => c === 2);
    expect(bandCounts12.length).toBeGreaterThan(0);
    expect(bandCounts56.length).toBeGreaterThan(0);

    const hasConstantWidth = pairs(bandsOnlyLines).some(([code]) => code === '43');
    expect(hasConstantWidth).toBe(true);

    // No pinned points in this export — the arc/triangle glyphs must NOT appear.
    expect(lwpolylineVertexCounts(bandsOnlyLines, 'ANALIZA_S12')).not.toContain(10);
    expect(lwpolylineVertexCounts(bandsOnlyLines, 'ANALIZA_S56')).not.toContain(3);
  });

  it('does not export compliance bands when analysisResults is empty, even with pinned points present', () => {
    const bandCounts12 = lwpolylineVertexCounts(glyphOnlyLines, 'ANALIZA_S12').filter((c) => c === 2);
    const bandCounts56 = lwpolylineVertexCounts(glyphOnlyLines, 'ANALIZA_S56').filter((c) => c === 2);
    expect(bandCounts12.length).toBe(0);
    expect(bandCounts56.length).toBe(0);
  });
});
