import { describe, it, expect } from 'vitest';
import {
  resolveBuildingType,
  extractOsmBuildingElevation,
  formatOsmBuildingName,
  parseOverpassBuildingsResponse,
  OverpassResponse,
} from './osmBuildingsClient';
import { CrsDetectionResult } from '../../../utils/geoTransform';

const EPSG_2180: CrsDetectionResult = {
  crs: 'EPSG:2180',
  description: 'PL-1992 (EPSG:2180)',
  geodeticLabel: 'ETRF2000-PL / CS1992',
  isGeodetic: true,
};

describe('osmBuildingsClient', () => {
  describe('resolveBuildingType', () => {
    it('resolves residential types correctly', () => {
      expect(resolveBuildingType({ building: 'house' })).toBe('residential');
      expect(resolveBuildingType({ building: 'apartments' })).toBe('residential');
      expect(resolveBuildingType({ building: 'residential' })).toBe('residential');
      expect(resolveBuildingType({ building: 'yes' })).toBe('residential');
    });

    it('resolves service and commercial types correctly', () => {
      expect(resolveBuildingType({ building: 'school' })).toBe('service');
      expect(resolveBuildingType({ building: 'kindergarten' })).toBe('service');
      expect(resolveBuildingType({ building: 'office' })).toBe('service');
      expect(resolveBuildingType({ building: 'retail' })).toBe('service');
      expect(resolveBuildingType({ building: 'yes', amenity: 'hospital' })).toBe('service');
    });

    it('resolves garage types correctly', () => {
      expect(resolveBuildingType({ building: 'garage' })).toBe('garage');
      expect(resolveBuildingType({ building: 'garages' })).toBe('garage');
      expect(resolveBuildingType({ building: 'shed' })).toBe('garage');
      expect(resolveBuildingType({ building: 'carport' })).toBe('garage');
    });
  });

  describe('extractOsmBuildingElevation', () => {
    it('uses explicit height when provided', () => {
      const res = extractOsmBuildingElevation({ height: '18.5 m' });
      expect(res.defaultHeight).toBe(18.5);
      expect(res.storeysCount).toBe(6);
      expect(res.heightSource).toBe('storeys-wfs');
    });

    it('derives height from building:levels when provided', () => {
      const res = extractOsmBuildingElevation({ 'building:levels': '4' });
      // 3.5 + (4 - 1) * 3.0 = 12.5m
      expect(res.defaultHeight).toBe(12.5);
      expect(res.storeysCount).toBe(4);
      expect(res.heightSource).toBe('storeys-wfs');
    });

    it('returns 1-floor height for building:levels = 1', () => {
      const res = extractOsmBuildingElevation({ 'building:levels': '1' });
      expect(res.defaultHeight).toBe(3.5);
      expect(res.storeysCount).toBe(1);
      expect(res.heightSource).toBe('storeys-wfs');
    });

    it('falls back to default height when no tags present', () => {
      const res = extractOsmBuildingElevation({});
      expect(res.defaultHeight).toBe(15.0);
      expect(res.storeysCount).toBe(5);
      expect(res.heightSource).toBe('default');
    });
  });

  describe('formatOsmBuildingName', () => {
    it('uses tags.name when present', () => {
      expect(formatOsmBuildingName(123, { name: 'Poznańskie Centrum Finansowe' })).toBe(
        'Poznańskie Centrum Finansowe'
      );
    });

    it('formats street and house number', () => {
      expect(formatOsmBuildingName(123, { 'addr:street': 'Świętego Czesława', 'addr:housenumber': '6A' })).toBe(
        'Świętego Czesława 6A'
      );
    });

    it('falls back to building tag or ID', () => {
      expect(formatOsmBuildingName(123, { building: 'school' })).toBe('Budynek (school) #123');
      expect(formatOsmBuildingName(123, { building: 'yes' })).toBe('Budynek OSM #123');
    });
  });

  describe('parseOverpassBuildingsResponse', () => {
    const mockProjectCenter = { lat: 52.39939, lon: 16.92350 };

    it('parses closed way buildings into BuildingLoop objects', () => {
      const mockResponse: OverpassResponse = {
        elements: [
          { type: 'node', id: 1, lat: 52.39930, lon: 16.92340 },
          { type: 'node', id: 2, lat: 52.39930, lon: 16.92360 },
          { type: 'node', id: 3, lat: 52.39945, lon: 16.92360 },
          { type: 'node', id: 4, lat: 52.39945, lon: 16.92340 },
          {
            type: 'way',
            id: 101,
            nodes: [1, 2, 3, 4, 1],
            tags: {
              building: 'apartments',
              'building:levels': '5',
              'addr:street': 'Różana',
              'addr:housenumber': '12',
            },
          },
        ],
      };

      const buildings = parseOverpassBuildingsResponse(mockResponse, mockProjectCenter, EPSG_2180, 200);
      expect(buildings.length).toBe(1);

      const b = buildings[0];
      expect(b.id).toBe('osm-bld-101');
      expect(b.name).toBe('Różana 12');
      expect(b.buildingType).toBe('residential');
      expect(b.storeysCount).toBe(5);
      expect(b.defaultHeight).toBe(15.5); // 3.5 + 4 * 3.0
      expect(b.isTested).toBe(false);
      expect(b.isIncluded).toBe(true);
      expect(b.isLocked).toBe(true);
      expect(b.vertices.length).toBeGreaterThanOrEqual(4);
      expect(b.segments.length).toBeGreaterThanOrEqual(4);
    });

    it('parses multipolygon relation buildings with courtyards (holes)', () => {
      const mockResponse: OverpassResponse = {
        elements: [
          // Outer ring
          { type: 'node', id: 1, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 2, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 3, lat: 52.4000, lon: 16.9240 },
          { type: 'node', id: 4, lat: 52.4000, lon: 16.9230 },
          { type: 'way', id: 201, nodes: [1, 2, 3, 4, 1] },

          // Inner ring (courtyard)
          { type: 'node', id: 5, lat: 52.3993, lon: 16.9233 },
          { type: 'node', id: 6, lat: 52.3993, lon: 16.9237 },
          { type: 'node', id: 7, lat: 52.3997, lon: 16.9237 },
          { type: 'node', id: 8, lat: 52.3997, lon: 16.9233 },
          { type: 'way', id: 202, nodes: [5, 6, 7, 8, 5] },

          // Relation
          {
            type: 'relation',
            id: 301,
            members: [
              { type: 'way', ref: 201, role: 'outer' },
              { type: 'way', ref: 202, role: 'inner' },
            ],
            tags: {
              building: 'university',
              name: 'Politechnika',
              'building:levels': '4',
            },
          },
        ],
      };

      const buildings = parseOverpassBuildingsResponse(mockResponse, mockProjectCenter, EPSG_2180, 200);
      expect(buildings.length).toBe(1);

      const b = buildings[0];
      expect(b.id).toBe('osm-bld-rel-301');
      expect(b.name).toBe('Politechnika');
      expect(b.buildingType).toBe('service');
      expect(b.holes).toBeDefined();
      expect(b.holes?.length).toBe(1);
      expect(b.holes?.[0].length).toBeGreaterThanOrEqual(4);
    });
  });
});
