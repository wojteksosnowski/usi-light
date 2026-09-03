import { describe, it, expect } from 'vitest';
import {
  detectCoordinateSystem,
  cadPointToWgs84,
  wgs84ToCadPoint,
  latLonToWebMercatorPixel,
  pixelToTileCoords,
} from './geoTransform';

describe('geoTransform', () => {
  it('detects PL-1992 (EPSG:2180) from mapa.dxf coordinates', () => {
    // Krakow coordinates from reference/mapa.dxf
    const points = [
      { x: 573256.92, y: 246143.37 },
      { x: 573011.55, y: 246143.78 },
      { x: 573178.01, y: 246262.35 },
    ];
    const res = detectCoordinateSystem(points);
    expect(res.crs).toBe('EPSG:2180');
    expect(res.isGeodetic).toBe(true);
  });

  it('transforms PL-1992 point to WGS84 accurately for Krakow', () => {
    const pt = { x: 573256.92, y: 246143.37 };
    const crs = { crs: 'EPSG:2180' as const, description: 'PL-1992', isGeodetic: true };
    const wgs = cadPointToWgs84(pt, crs);

    // Krakow Czyzyny / Nowa Huta latitude ~ 50.078, longitude ~ 20.024
    expect(wgs.lat).toBeCloseTo(50.078, 2);
    expect(wgs.lon).toBeCloseTo(20.024, 2);
  });

  it('detects PL-2000 zone 7 (EPSG:2178)', () => {
    // Warsaw PL-2000 zone 7 (Easting ~ 7 500 000, Northing ~ 5 790 000)
    const points = [
      { x: 7500000, y: 5790000 },
      { x: 7500100, y: 5790100 },
    ];
    const res = detectCoordinateSystem(points);
    expect(res.crs).toBe('EPSG:2178');
    expect(res.zone).toBe(7);
  });

  it('detects local CAD coordinates for origin-centered project', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 25, y: 0 },
      { x: 25, y: 15 },
      { x: 0, y: 15 },
    ];
    const res = detectCoordinateSystem(points);
    expect(res.crs).toBe('LOCAL');
    expect(res.isGeodetic).toBe(false);
  });

  it('computes Web Mercator pixels and tile coordinates correctly at zoom 18', () => {
    const latLon = { lat: 50.078, lon: 20.024 };
    const px = latLonToWebMercatorPixel(latLon, 18);
    expect(px.x).toBeGreaterThan(0);
    expect(px.y).toBeGreaterThan(0);

    const tile = pixelToTileCoords(px, 18);
    expect(tile.z).toBe(18);
    expect(tile.x).toBeGreaterThan(0);
    expect(tile.y).toBeGreaterThan(0);
  });
});
