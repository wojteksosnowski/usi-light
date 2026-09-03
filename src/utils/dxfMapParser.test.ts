import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseDxfWithMetadata } from './dxfParser';

describe('dxfParser - mapa.dxf', () => {
  it('parses reference/mapa.dxf extracting 11 buildings and detecting PL-1992', () => {
    const filePath = path.resolve(__dirname, '../../reference/mapa.dxf');
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    const res = parseDxfWithMetadata(content);

    expect(res.buildings.length).toBe(11);
    expect(res.unitInfo.scale).toBe(1.0);
    expect(res.crs?.crs).toBe('EPSG:2180');
    expect(res.crs?.isGeodetic).toBe(true);

    // Verify coordinates stay in original geodetic meters (~573000, ~246000)
    const firstVertex = res.buildings[0].vertices[0];
    expect(firstVertex.x).toBeGreaterThan(500000);
    expect(firstVertex.y).toBeGreaterThan(200000);
  });
});
