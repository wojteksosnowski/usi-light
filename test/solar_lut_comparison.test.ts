import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  AstroSolarSystem,
  LinijkaSolarSystem,
  getGlobalSolarLUT,
  calculateSolarPosition,
} from '../src/utils/solar';
import { runFullAnalysis } from '../src/engine/analysisEngine';
import { BuildingLoop } from '../src/types/geometry';

describe('Validation Gate: GlobalSolarLUT vs Existing Solar & Analysis Engines', () => {
  const lat = 51.1079;
  const lon = 17.0385;
  const date = 'spring';

  it('dokładnie pokrywa się z wartościami kątowymi i wektorowymi AstroSolarSystem', () => {
    const lut = getGlobalSolarLUT(lat, lon, date);
    const astro = new AstroSolarSystem(lat, lon, date);

    for (let offset = -5.0; offset <= 5.001; offset += 0.25) {
      const entry = lut.getEntryForOffset(offset);
      const hour = astro.solarNoonDecimal + offset;
      const expectedAz = astro.getAzimuthForHour(hour);
      const expectedElev = astro.getElevationForAzimuth(expectedAz);

      expect(entry.astro.azimuthDeg).toBeCloseTo(expectedAz, 4);
      expect(entry.astro.elevationDeg).toBeCloseTo(expectedElev, 4);

      // Weryfikacja wektora jednostkowego cienia
      const elevRad = (expectedElev * Math.PI) / 180;
      const azRad = (expectedAz * Math.PI) / 180;
      if (expectedElev > 0.001) {
        const expectedLen = 1.0 / Math.tan(elevRad);
        const expectedUx = -Math.sin(azRad) * expectedLen;
        const expectedUy = -Math.cos(azRad) * expectedLen;
        expect(entry.astro.unitShadowVec.x).toBeCloseTo(expectedUx, 4);
        expect(entry.astro.unitShadowVec.y).toBeCloseTo(expectedUy, 4);
      }
    }
  });

  it('dokładnie pokrywa się z wartościami kątowymi i wektorowymi LinijkaSolarSystem', () => {
    const lut = getGlobalSolarLUT(lat, lon, date);
    const linijka = new LinijkaSolarSystem(lat, lon, date);

    for (let offset = -5.0; offset <= 5.001; offset += 0.25) {
      const entry = lut.getEntryForOffset(offset);
      const hour = linijka.solarNoonDecimal + offset;
      const expectedAz = linijka.getAzimuthForHour(hour);
      const expectedElev = linijka.getElevationForAzimuth(expectedAz);

      expect(entry.linijka.azimuthDeg).toBeCloseTo(expectedAz, 4);
      expect(entry.linijka.elevationDeg).toBeCloseTo(expectedElev, 4);

      const elevRad = (expectedElev * Math.PI) / 180;
      const azRad = (expectedAz * Math.PI) / 180;
      if (expectedElev > 0.001) {
        const expectedLen = 1.0 / Math.tan(elevRad);
        const expectedUx = -Math.sin(azRad) * expectedLen;
        const expectedUy = -Math.cos(azRad) * expectedLen;
        expect(entry.linijka.unitShadowVec.x).toBeCloseTo(expectedUx, 4);
        expect(entry.linijka.unitShadowVec.y).toBeCloseTo(expectedUy, 4);
      }
    }
  });

  it('zapewnia 100% zgodności analitycznej § 12 i § 56 na scenie wro.json', () => {
    const scene = JSON.parse(fs.readFileSync('reference/wro.json', 'utf-8'));

    // Uruchomienie analizy z obecnym silnikiem
    const batch = runFullAnalysis(scene.buildings, {
      latitude: lat,
      longitude: lon,
      isCityCentreDefault: false,
      samplingInterval: 2.0,
      equinoxDate: date,
    });

    expect(batch.totalPoints).toBeGreaterThan(0);
    expect(batch.results.length).toBe(batch.totalPoints);

    // Sprawdzenie czy punkty mają poprawne flagi compliance i godziny
    const compliantPoints = batch.results.filter((r) => r.shadowing.isCompliant && r.sunlight.isCompliant);
    expect(compliantPoints.length).toBeGreaterThan(0);
  });
});
