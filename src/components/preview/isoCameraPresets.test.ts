import { describe, it, expect } from 'vitest';
import { getIsoCameraOffset, getSunDirection3D, ISO_POLAR_ANGLE_RAD, type IsoOrientation } from './isoCameraPresets';

describe('isoCameraPresets', () => {
  describe('getIsoCameraOffset', () => {
    it('positions South view in +Z and North view in -Z matching Three.js world convention', () => {
      const south = getIsoCameraOffset('S', 10);
      const north = getIsoCameraOffset('N', 10);

      // S (Azimuth 180°): Camera is at South (+Z) looking towards North (-Z)
      expect(south.x).toBeCloseTo(0, 5);
      expect(south.z).toBeGreaterThan(0);

      // N (Azimuth 0°): Camera is at North (-Z) looking towards South (+Z)
      expect(north.x).toBeCloseTo(0, 5);
      expect(north.z).toBeLessThan(0);
    });

    it('positions East view in +X and West view in -X', () => {
      const east = getIsoCameraOffset('E', 10);
      const west = getIsoCameraOffset('W', 10);

      // E (Azimuth 90°): Camera is at East (+X)
      expect(east.x).toBeGreaterThan(0);
      expect(east.z).toBeCloseTo(0, 5);

      // W (Azimuth 270°): Camera is at West (-X)
      expect(west.x).toBeLessThan(0);
      expect(west.z).toBeCloseTo(0, 5);
    });

    it('positions SW view in -X, +Z', () => {
      const sw = getIsoCameraOffset('SW', 10);
      expect(sw.x).toBeLessThan(0);
      expect(sw.z).toBeGreaterThan(0);
    });
  });

  describe('getSunDirection3D', () => {
    it('places sun at South (+Z) for solar noon (Azimuth 180°), shining towards North (-Z)', () => {
      const sunAtNoon = getSunDirection3D(180, 45); // South, 45 deg elevation

      // Sun vector points towards the sun (source of light):
      // South -> +Z in Three.js world
      expect(sunAtNoon.x).toBeCloseTo(0, 5);
      expect(sunAtNoon.y).toBeCloseTo(Math.sin((45 * Math.PI) / 180), 5);
      expect(sunAtNoon.z).toBeGreaterThan(0); // Located in the South (+Z)
    });

    it('places morning sun in East (+X, +Z/South) for Azimuth 120°', () => {
      const morningSun = getSunDirection3D(120, 30);
      expect(morningSun.x).toBeGreaterThan(0); // East (+X)
      expect(morningSun.z).toBeGreaterThan(0); // South (+Z)
      expect(morningSun.y).toBeGreaterThan(0); // Above ground
    });

    it('places afternoon sun in West (-X, +Z/South) for Azimuth 240°', () => {
      const afternoonSun = getSunDirection3D(240, 30);
      expect(afternoonSun.x).toBeLessThan(0); // West (-X)
      expect(afternoonSun.z).toBeGreaterThan(0); // South (+Z)
      expect(afternoonSun.y).toBeGreaterThan(0); // Above ground
    });
  });
});
