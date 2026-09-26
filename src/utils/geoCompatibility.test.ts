import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistanceKm,
  findNearestPolishCity,
  computePointsGeoContext,
  validateGeoCompatibility,
} from './geoTransform';

describe('Geographic compatibility and distance calculations', () => {
  it('calculates Haversine distance correctly between Warsaw and Krakow', () => {
    const warsaw = { lat: 52.2297, lon: 21.0122 };
    const krakow = { lat: 50.0647, lon: 19.9450 };

    const dist = calculateHaversineDistanceKm(warsaw, krakow);
    expect(dist).toBeGreaterThan(240);
    expect(dist).toBeLessThan(260);
  });

  it('finds nearest Polish city accurately', () => {
    // Współrzędne Nowej Huty w Krakowie
    const nowaHuta = { lat: 50.0785, lon: 20.0233 };
    const city = findNearestPolishCity(nowaHuta);
    expect(city.name).toBe('Kraków');
    expect(city.distanceKm).toBeLessThan(10);
  });

  it('detects COMPATIBLE_EXACT when two geodetic contexts match closely', () => {
    // Punkty w EPSG:2180 w Krakowie
    const ctx1 = computePointsGeoContext([
      { x: 573200, y: 246200 },
      { x: 573250, y: 246250 },
    ]);
    const ctx2 = computePointsGeoContext([
      { x: 573220, y: 246220 },
      { x: 573260, y: 246260 },
    ]);

    const res = validateGeoCompatibility(ctx1, ctx2);
    expect(res.status).toBe('COMPATIBLE_EXACT');
    expect(res.isCompatible).toBe(true);
    expect(res.warningLevel).toBe('none');
    expect(res.recommendedAction).toBe('merge');
  });

  it('detects LOCATION_MISMATCH when two geodetic contexts are in different cities', () => {
    // EPSG:2180 w Krakowie (~573000, ~246000) vs EPSG:2180 w Gdańsku (~475000, ~725000)
    const ctxKrakow = computePointsGeoContext([
      { x: 573200, y: 246200 },
      { x: 573250, y: 246250 },
    ]);
    const ctxGdansk = computePointsGeoContext([
      { x: 475000, y: 725000 },
      { x: 475050, y: 725050 },
    ]);

    const res = validateGeoCompatibility(ctxKrakow, ctxGdansk);
    expect(res.status).toBe('LOCATION_MISMATCH');
    expect(res.isCompatible).toBe(false);
    expect(res.warningLevel).toBe('warning');
    expect(res.recommendedAction).toBe('replace');
    expect(res.distanceKm).toBeGreaterThan(400);
  });

  it('detects GEODETIC_INTO_LOCAL when geodetic DXF is imported into local CAD scene', () => {
    const ctxLocal = computePointsGeoContext([
      { x: 0, y: 0 },
      { x: 25, y: 25 },
    ], { lat: 52.2297, lon: 21.0122 });

    const ctxGeodetic = computePointsGeoContext([
      { x: 573200, y: 246200 },
      { x: 573250, y: 246250 },
    ]);

    const res = validateGeoCompatibility(ctxLocal, ctxGeodetic);
    expect(res.status).toBe('GEODETIC_INTO_LOCAL');
    expect(res.isCompatible).toBe(false);
    expect(res.warningLevel).toBe('warning');
    expect(res.recommendedAction).toBe('replace');
  });
});
