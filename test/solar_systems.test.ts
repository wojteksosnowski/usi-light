import { describe, it, expect } from 'vitest';
import {
  AstroSolarSystem,
  LinijkaSolarSystem,
  createLineEquationFromAzimuth,
} from '../src/utils/solar';

describe('ISolarHourSystem Implementations (Astro vs Linijka Słońca)', () => {
  const latWarsaw = 52.2297;
  const lonWarsaw = 21.0122;

  describe('LinijkaSolarSystem (Geometric Sun Ruler - Twarowski)', () => {
    const linijka = new LinijkaSolarSystem(latWarsaw, lonWarsaw, 'spring');

    it('has exact geometric anchor azimuths at 06:00, 12:00, 18:00', () => {
      const az6 = linijka.getAzimuthForHour(6.0);
      const az12 = linijka.getAzimuthForHour(12.0);
      const az18 = linijka.getAzimuthForHour(18.0);

      expect(az6).toBeCloseTo(90.0, 4); // Exact East
      expect(az12).toBeCloseTo(180.0, 4); // Exact South
      expect(az18).toBeCloseTo(270.0, 4); // Exact West
    });

    it('exhibits exact symmetry around 12:00 (South)', () => {
      for (const deltaH of [0.5, 1.0, 2.0, 3.5, 5.0]) {
        const azMorning = linijka.getAzimuthForHour(12.0 - deltaH);
        const azAfternoon = linijka.getAzimuthForHour(12.0 + deltaH);

        expect(azMorning + azAfternoon).toBeCloseTo(360.0, 4);
      }
    });

    it('performs exact roundtrip hour -> azimuth -> hour (O(1) inverse mapping)', () => {
      for (let h = 6.0; h <= 18.0; h += 0.25) {
        const az = linijka.getAzimuthForHour(h);
        const reconstructedH = linijka.getHourForAzimuth(az);
        expect(reconstructedH).toBeCloseTo(h, 4);
      }
    });

    it('generates normalized 2D line equations A*x + B*y = 0', () => {
      for (let h = 7.0; h <= 17.0; h += 1.0) {
        const lineEq = linijka.getLineEquationForHour(h);
        const az = linijka.getAzimuthForHour(h);
        const azRad = (az * Math.PI) / 180;
        const dir = { x: Math.sin(azRad), y: Math.cos(azRad) };

        // Normalization A^2 + B^2 = 1
        expect(lineEq.A * lineEq.A + lineEq.B * lineEq.B).toBeCloseTo(1.0, 6);

        // Perpendicularity: A * dir.x + B * dir.y = 0
        const dot = lineEq.A * dir.x + lineEq.B * dir.y;
        expect(dot).toBeCloseTo(0.0, 6);
      }
    });

    it('computes exact equinox elevation according to golden identity', () => {
      const az12 = linijka.getAzimuthForHour(12.0); // 180 deg
      const elev12 = linijka.getElevationForAzimuth(az12);

      // Noon elevation on equinox = 90 - latitude
      expect(elev12).toBeCloseTo(90.0 - latWarsaw, 4);
    });

    it('generates hour lines list for CAD viewport offset from 12:00 (-5h to +5h)', () => {
      const lines = linijka.getHourLines(-5, 5, 1);
      expect(lines.length).toBe(11); // -5, -4, -3, -2, -1, 0, +1, +2, +3, +4, +5
      expect(lines[0].timeStr).toBe('07:00');
      expect(lines[0].offsetHours).toBe(-5);
      expect(lines[5].timeStr).toBe('12:00');
      expect(lines[5].offsetHours).toBe(0);
      expect(lines[5].azimuthDeg).toBeCloseTo(180.0, 4);
      expect(lines[10].timeStr).toBe('17:00');
      expect(lines[10].offsetHours).toBe(5);
    });
  });

  describe('AstroSolarSystem (Astronomical NOAA)', () => {
    const astro = new AstroSolarSystem(latWarsaw, lonWarsaw, 'spring');

    it('computes realistic solar noon decimal for Warsaw', () => {
      // In Warsaw (lon ~21.0° E, UTC+1), solar noon is around 11:36 - 11:45
      expect(astro.solarNoonDecimal).toBeGreaterThan(11.0);
      expect(astro.solarNoonDecimal).toBeLessThan(12.5);
    });

    it('generates hour lines in analysis window in +-1h steps from solar noon', () => {
      const lines = astro.getHourLines(-5, 5, 1);
      // Contains 11 hour lines (-5h, -4h, ..., 0h, ..., +5h from solar noon)
      expect(lines.length).toBe(11);

      // Verify solar noon line exists and has az = 180°
      const noonLine = lines.find((l) => Math.abs(l.hourFraction - astro.solarNoonDecimal) < 1e-3);
      expect(noonLine).toBeDefined();
      expect(noonLine?.offsetHours).toBe(0);
      expect(noonLine?.azimuthDeg).toBeCloseTo(180.0, 2);

      // Verify -1h and +1h lines
      const lineMinus1 = lines.find((l) => l.offsetHours === -1);
      const linePlus1 = lines.find((l) => l.offsetHours === 1);
      expect(lineMinus1).toBeDefined();
      expect(linePlus1).toBeDefined();
      expect(lineMinus1!.azimuthDeg).toBeLessThan(180.0);
      expect(linePlus1!.azimuthDeg).toBeGreaterThan(180.0);
    });

    it('performs accurate roundtrip hour -> azimuth -> hour via binary search', () => {
      for (let h = 8.0; h <= 16.0; h += 0.5) {
        const az = astro.getAzimuthForHour(h);
        const reconstructedH = astro.getHourForAzimuth(az);
        expect(reconstructedH).toBeCloseTo(h, 2);
      }
    });

    it('generates valid 2D line equations A*x + B*y = 0', () => {
      for (let h = 8.0; h <= 16.0; h += 1.0) {
        const lineEq = astro.getLineEquationForHour(h);
        const az = astro.getAzimuthForHour(h);
        const azRad = (az * Math.PI) / 180;
        const dir = { x: Math.sin(azRad), y: Math.cos(azRad) };

        expect(lineEq.A * lineEq.A + lineEq.B * lineEq.B).toBeCloseTo(1.0, 6);
        expect(lineEq.A * dir.x + lineEq.B * dir.y).toBeCloseTo(0.0, 6);
      }
    });
  });

  describe('Comparison across multiple Polish cities', () => {
    const cities = [
      { name: 'Wrocław', lat: 51.1079, lon: 17.0385 },
      { name: 'Warszawa', lat: 52.2297, lon: 21.0122 },
      { name: 'Gdańsk', lat: 54.3520, lon: 18.6466 },
    ];

    for (const city of cities) {
      it(`validates Linijka and Astro systems for ${city.name}`, () => {
        const lin = new LinijkaSolarSystem(city.lat, city.lon, 'spring');
        const ast = new AstroSolarSystem(city.lat, city.lon, 'spring');

        // Linijka South azimuth is always 180°
        expect(lin.getAzimuthForHour(12.0)).toBeCloseTo(180.0, 4);

        // Astro noon azimuth is 180° at its calculated solar noon
        const astNoonAz = ast.getAzimuthForHour(ast.solarNoonDecimal);
        expect(astNoonAz).toBeCloseTo(180.0, 2);

        // Noon elevation matches latitude
        expect(lin.getElevationForAzimuth(180.0)).toBeCloseTo(90.0 - city.lat, 4);
      });
    }
  });
});
