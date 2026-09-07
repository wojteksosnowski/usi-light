import { describe, it, expect } from 'vitest';
import { parseWktToRings } from '../src/modules/wfs-import/services/uldkClient';

describe('ULDK Client & WKT Parser', () => {
  it('parses standard 2D POLYGON from ULDK', () => {
    const wkt = 'POLYGON((629552.18 483623.91, 629553.69 483615.23, 629570.15 483613.74, 629552.18 483623.91))';
    const rings = parseWktToRings(wkt);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
    expect(rings[0][0]).toEqual([629552.18, 483623.91]);
    expect(rings[0][1]).toEqual([629553.69, 483615.23]);
  });

  it('parses WKT with PostGIS SRID prefix (SRID=2180;POLYGON(...))', () => {
    const wkt = 'SRID=2180;POLYGON((100 200, 150 200, 150 250, 100 250, 100 200))';
    const rings = parseWktToRings(wkt);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
    expect(rings[0][0]).toEqual([100, 200]);
    expect(rings[0][2]).toEqual([150, 250]);
  });

  it('parses MULTIPOLYGON geometry from ULDK', () => {
    const wkt = 'SRID=2180;MULTIPOLYGON(((10 20, 30 20, 30 40, 10 40, 10 20)), ((50 60, 70 60, 70 80, 50 80, 50 60)))';
    const rings = parseWktToRings(wkt);
    expect(rings).toHaveLength(2);
    expect(rings[0][0]).toEqual([10, 20]);
    expect(rings[1][0]).toEqual([50, 60]);
  });

  it('returns empty array for invalid or empty input', () => {
    expect(parseWktToRings('')).toEqual([]);
    expect(parseWktToRings('POINT(10 20)')).toEqual([]);
  });
});
