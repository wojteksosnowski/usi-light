import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  parseDxfWithMetadata,
  classifyDxfLayer,
  assembleDxfLinesIntoLoops,
} from './dxfParser';

describe('dxfParser geodetic and entity handling', () => {
  it('parses reference/mapa.dxf in geodetic coordinates (EPSG:2180 Kraków)', () => {
    const filePath = path.resolve(__dirname, '../../reference/mapa.dxf');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf8');
    const result = parseDxfWithMetadata(content);

    expect(result.buildings.length).toBeGreaterThan(0);
    expect(result.crs?.crs).toBe('EPSG:2180');
    expect(result.crs?.geodeticLabel).toContain('1992');
    expect(result.unitInfo.scale).toBe(1.0);
    expect(result.report.geoContext.nearestCity).toBe('Kraków');

    // Sprawdź czy współrzędne pierwszego budynku są w układzie EPSG:2180 (~573000, ~246000)
    const firstVertex = result.buildings[0].vertices[0];
    expect(firstVertex.x).toBeGreaterThan(500000);
    expect(firstVertex.x).toBeLessThan(600000);
    expect(firstVertex.y).toBeGreaterThan(200000);
    expect(firstVertex.y).toBeLessThan(300000);
  });

  it('correctly classifies layers into building and boundary categories', () => {
    expect(classifyDxfLayer('BUDYNKI').category).toBe('building');
    expect(classifyDxfLayer('OT_BUBD_A').category).toBe('building');
    expect(classifyDxfLayer('B-ISTNIEJACE').category).toBe('building');

    expect(classifyDxfLayer('DZIALKI').category).toBe('boundary');
    expect(classifyDxfLayer('GRANICE').category).toBe('boundary');
    expect(classifyDxfLayer('OT_EGDB_A').category).toBe('boundary');
    expect(classifyDxfLayer('D-GRANICA').category).toBe('boundary');
    expect(classifyDxfLayer('DZIALKI_EWIDENCYJNE').areaType).toBe('plot');

    expect(classifyDxfLayer('PLAC_ZABAW').category).toBe('boundary');
    expect(classifyDxfLayer('PLAC_ZABAW').areaType).toBe('playground');

    expect(classifyDxfLayer('BALKON').category).toBe('balcony');
  });

  it('assembles separate LINE entities into closed polygon loops', () => {
    const lines = [
      { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, layer: 'BUD_TEST' },
      { p1: { x: 10, y: 0 }, p2: { x: 10, y: 10 }, layer: 'BUD_TEST' },
      { p1: { x: 10, y: 10 }, p2: { x: 0, y: 10 }, layer: 'BUD_TEST' },
      { p1: { x: 0, y: 10 }, p2: { x: 0, y: 0 }, layer: 'BUD_TEST' },
    ];

    const loops = assembleDxfLinesIntoLoops(lines);
    expect(loops.length).toBe(1);
    expect(loops[0].layer).toBe('BUD_TEST');
    expect(loops[0].vertices.length).toBe(4);
    expect(loops[0].vertices[0]).toEqual({ x: 0, y: 0 });
    expect(loops[0].vertices[1]).toEqual({ x: 10, y: 0 });
    expect(loops[0].vertices[2]).toEqual({ x: 10, y: 10 });
    expect(loops[0].vertices[3]).toEqual({ x: 0, y: 10 });
  });
});
