import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractCityAndDistrict,
  reverseGeocodeLocation,
  latLonToBbox,
} from './geocoding';

describe('geocoding & reverse geocoding', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractCityAndDistrict', () => {
    it('formats City - District when both are present', () => {
      const result = extractCityAndDistrict({
        city: 'Warszawa',
        suburb: 'Wola',
      });
      expect(result.city).toBe('Warszawa');
      expect(result.district).toBe('Wola');
      expect(result.formattedProjectName).toBe('Warszawa - Wola');
    });

    it('formats City - District using neighbourhood or city_district', () => {
      const result1 = extractCityAndDistrict({
        city: 'Kraków',
        neighbourhood: 'Stare Miasto',
      });
      expect(result1.formattedProjectName).toBe('Kraków - Stare Miasto');

      const result2 = extractCityAndDistrict({
        town: 'Gdynia',
        city_district: 'Orłowo',
      });
      expect(result2.formattedProjectName).toBe('Gdynia - Orłowo');
    });

    it('formats only City when district is missing or identical to city', () => {
      const result1 = extractCityAndDistrict({
        city: 'Poznań',
      });
      expect(result1.city).toBe('Poznań');
      expect(result1.district).toBeUndefined();
      expect(result1.formattedProjectName).toBe('Poznań');

      const result2 = extractCityAndDistrict({
        city: 'Wrocław',
        suburb: 'Wrocław',
      });
      expect(result2.city).toBe('Wrocław');
      expect(result2.district).toBeUndefined();
      expect(result2.formattedProjectName).toBe('Wrocław');
    });

    it('handles village/municipality when city/town are absent', () => {
      const result = extractCityAndDistrict({
        village: 'Zalesie Górne',
      });
      expect(result.city).toBe('Zalesie Górne');
      expect(result.formattedProjectName).toBe('Zalesie Górne');
    });

    it('returns default fallback when address is empty or undefined', () => {
      const result = extractCityAndDistrict(undefined);
      expect(result.formattedProjectName).toBe('Projekt');
    });
  });

  describe('reverseGeocodeLocation', () => {
    it('fetches from Nominatim and returns structured result', async () => {
      const mockResponse = {
        display_name: 'Wola, Warszawa, województwo mazowieckie, Polska',
        address: {
          city: 'Warszawa',
          suburb: 'Wola',
          country: 'Polska',
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await reverseGeocodeLocation(52.2319, 20.9854);
      expect(result).not.toBeNull();
      expect(result?.city).toBe('Warszawa');
      expect(result?.district).toBe('Wola');
      expect(result?.formattedProjectName).toBe('Warszawa - Wola');
      expect(result?.lat).toBe(52.2319);
      expect(result?.lon).toBe(20.9854);
    });

    it('handles fetch failure gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await reverseGeocodeLocation(52.2319, 20.9854);
      expect(result).toBeNull();
    });
  });

  describe('latLonToBbox', () => {
    it('calculates bounding box correctly', () => {
      const [minLon, minLat, maxLon, maxLat] = latLonToBbox(52.0, 21.0, 100);
      expect(minLat).toBeLessThan(52.0);
      expect(maxLat).toBeGreaterThan(52.0);
      expect(minLon).toBeLessThan(21.0);
      expect(maxLon).toBeGreaterThan(21.0);
    });
  });
});
