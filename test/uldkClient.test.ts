import { describe, it, expect } from 'vitest';
import { parseWktToPolygonParts } from '../src/modules/wfs-import/services/uldkClient';

describe('ULDK Client & WKT Parser', () => {
  it('parses standard 2D POLYGON from ULDK', () => {
    const wkt = 'POLYGON((629552.18 483623.91, 629553.69 483615.23, 629570.15 483613.74, 629552.18 483623.91))';
    const parts = parseWktToPolygonParts(wkt);
    expect(parts).toHaveLength(1);
    expect(parts[0].holes).toHaveLength(0);
    expect(parts[0].outer).toHaveLength(4);
    expect(parts[0].outer[0]).toEqual([629552.18, 483623.91]);
    expect(parts[0].outer[1]).toEqual([629553.69, 483615.23]);
  });

  it('parses WKT with PostGIS SRID prefix (SRID=2180;POLYGON(...))', () => {
    const wkt = 'SRID=2180;POLYGON((100 200, 150 200, 150 250, 100 250, 100 200))';
    const parts = parseWktToPolygonParts(wkt);
    expect(parts).toHaveLength(1);
    expect(parts[0].outer).toHaveLength(5);
    expect(parts[0].outer[0]).toEqual([100, 200]);
    expect(parts[0].outer[2]).toEqual([150, 250]);
  });

  it('parses MULTIPOLYGON geometry from ULDK', () => {
    const wkt = 'SRID=2180;MULTIPOLYGON(((10 20, 30 20, 30 40, 10 40, 10 20)), ((50 60, 70 60, 70 80, 50 80, 50 60)))';
    const parts = parseWktToPolygonParts(wkt);
    expect(parts).toHaveLength(2);
    expect(parts[0].outer[0]).toEqual([10, 20]);
    expect(parts[1].outer[0]).toEqual([50, 60]);
    expect(parts[0].holes).toHaveLength(0);
    expect(parts[1].holes).toHaveLength(0);
  });

  it('parses MULTIPOLYGON where one part has a hole, without leaking rings across parts', () => {
    const wkt = 'MULTIPOLYGON(((0 0, 100 0, 100 100, 0 100, 0 0), (40 40, 60 40, 60 60, 40 60, 40 40)), ((200 200, 250 200, 250 250, 200 250, 200 200)))';
    const parts = parseWktToPolygonParts(wkt);
    expect(parts).toHaveLength(2);
    expect(parts[0].outer[0]).toEqual([0, 0]);
    expect(parts[0].holes).toHaveLength(1);
    expect(parts[0].holes[0][0]).toEqual([40, 40]);
    expect(parts[1].outer[0]).toEqual([200, 200]);
    expect(parts[1].holes).toHaveLength(0);
  });

  it('parses POLYGON with a hole (donut/enclave parcel) and keeps outer/inner distinction', () => {
    const wkt = 'POLYGON((0 0, 100 0, 100 100, 0 100, 0 0), (40 40, 60 40, 60 60, 40 60, 40 40))';
    const parts = parseWktToPolygonParts(wkt);
    expect(parts).toHaveLength(1);
    expect(parts[0].outer).toHaveLength(5);
    expect(parts[0].holes).toHaveLength(1);
    expect(parts[0].holes[0]).toHaveLength(5);
    expect(parts[0].holes[0][0]).toEqual([40, 40]);
  });

  it('returns empty array for invalid or empty input', () => {
    expect(parseWktToPolygonParts('')).toEqual([]);
    expect(parseWktToPolygonParts('POINT(10 20)')).toEqual([]);
  });
});
