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
    it('uses explicit height and min_height when provided', () => {
      const res = extractOsmBuildingElevation({ height: '95 m', min_height: '30 m' });
      expect(res.elevation).toBe(30.0);
      expect(res.defaultHeight).toBe(65.0);
      expect(res.storeysCount).toBe(22); // (65 - 3.5)/3 + 1 = 21.5 -> 22
      expect(res.heightSource).toBe('storeys-wfs');
    });

    it('handles building:min_level and building:levels correctly', () => {
      const res = extractOsmBuildingElevation({ 'building:levels': '10', 'building:min_level': '2' });
      // baseElevation for 2 levels below = 3.5 + (2 - 1)*3.0 = 6.5m
      // bodyHeight for 10 levels = 3.5 + 9*3 = 30.5m
      expect(res.elevation).toBe(6.5);
      expect(res.defaultHeight).toBe(30.5);
      expect(res.storeysCount).toBe(10);
      expect(res.heightSource).toBe('storeys-wfs');
    });

    it('uses explicit height when provided without min_height', () => {
      const res = extractOsmBuildingElevation({ height: '18.5 m' });
      expect(res.elevation).toBe(0.0);
      expect(res.defaultHeight).toBe(18.5);
      expect(res.storeysCount).toBe(6);
      expect(res.heightSource).toBe('storeys-wfs');
    });

    it('derives height from building:levels when provided', () => {
      const res = extractOsmBuildingElevation({ 'building:levels': '4' });
      // 3.5 + (4 - 1) * 3.0 = 12.5m
      expect(res.elevation).toBe(0.0);
      expect(res.defaultHeight).toBe(12.5);
      expect(res.storeysCount).toBe(4);
      expect(res.heightSource).toBe('storeys-wfs');
    });

    it('returns 1-floor height for building:levels = 1', () => {
      const res = extractOsmBuildingElevation({ 'building:levels': '1' });
      expect(res.elevation).toBe(0.0);
      expect(res.defaultHeight).toBe(3.5);
      expect(res.storeysCount).toBe(1);
      expect(res.heightSource).toBe('storeys-wfs');
    });

    it('falls back to default height when no tags present', () => {
      const res = extractOsmBuildingElevation({});
      expect(res.elevation).toBe(0.0);
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

    it('parses closed way buildings with 100% vertex fidelity and proper elevation', () => {
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
      expect(b.elevation).toBe(0.0);
      expect(b.isTested).toBe(false);
      expect(b.isIncluded).toBe(true);
      expect(b.isLocked).toBe(true);

      // 100% zgodności wierzchołków (4 unikalne narożniki odpowiadające 4 węzłom OSM)
      expect(b.vertices.length).toBe(4);
      expect(b.segments.length).toBe(4);
      // Wszystkie segmenty fasady mają właściwe hBase i hTop
      for (const seg of b.segments) {
        expect(seg.hBase).toBe(0.0);
        expect(seg.hTop).toBe(15.5);
      }
    });

    it('parses multipolygon relation buildings with courtyards (holes) and 100% vertex correspondence', () => {
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
      expect(b.elevation).toBe(0.0);
      expect(b.defaultHeight).toBe(12.5); // 3.5 + 3*3.0
      expect(b.holes).toBeDefined();
      expect(b.holes?.length).toBe(1);
      expect(b.holes?.[0].length).toBe(4);
      expect(b.vertices.length).toBe(4);

      // Segmenty obwodu zewnętrznego (4) + otworu (4) = 8 segmentów
      expect(b.segments.length).toBe(8);
      for (const seg of b.segments) {
        expect(seg.hBase).toBe(0.0);
        expect(seg.hTop).toBe(12.5);
      }
    });

    it('parses type=building relation with elevated building:parts (min_height) and groups them into logical object', () => {
      const mockResponse: OverpassResponse = {
        elements: [
          // Part 1: Tower with min_height (nad podium)
          { type: 'node', id: 11, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 12, lat: 52.3990, lon: 16.9235 },
          { type: 'node', id: 13, lat: 52.3995, lon: 16.9235 },
          { type: 'node', id: 14, lat: 52.3995, lon: 16.9230 },
          {
            type: 'way',
            id: 401,
            nodes: [11, 12, 13, 14, 11],
            tags: { 'building:part': 'yes', height: '95 m', min_height: '30 m' },
          },

          // Part 2: Podium (od gruntu do 30m)
          { type: 'node', id: 21, lat: 52.3990, lon: 16.9235 },
          { type: 'node', id: 22, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 23, lat: 52.3995, lon: 16.9240 },
          { type: 'node', id: 24, lat: 52.3995, lon: 16.9235 },
          {
            type: 'way',
            id: 402,
            nodes: [21, 22, 23, 24, 21],
            tags: { 'building:part': 'yes', height: '30 m' },
          },

          // Relation grouping parts
          {
            type: 'relation',
            id: 501,
            members: [
              { type: 'way', ref: 401, role: 'part' },
              { type: 'way', ref: 402, role: 'part' },
            ],
            tags: {
              type: 'building',
              name: 'Centrum Biznesowe',
            },
          },
        ],
      };

      const buildings = parseOverpassBuildingsResponse(mockResponse, mockProjectCenter, EPSG_2180, 200);
      expect(buildings.length).toBe(2);

      const tower = buildings.find((b) => b.id === 'osm-part-401')!;
      const podium = buildings.find((b) => b.id === 'osm-part-402')!;

      expect(tower).toBeDefined();
      expect(podium).toBeDefined();

      // Weryfikacja wieży: posadowienie od 30m, grubość 65m, dachu na 95m
      expect(tower.elevation).toBe(30.0);
      expect(tower.defaultHeight).toBe(65.0);
      expect(tower.vertices.length).toBe(4);
      for (const seg of tower.segments) {
        expect(seg.hBase).toBe(30.0);
        expect(seg.hTop).toBe(95.0);
      }

      // Weryfikacja podium: posadowienie od 0m, wysokość 30m, dach na 30m
      expect(podium.elevation).toBe(0.0);
      expect(podium.defaultHeight).toBe(30.0);
      expect(podium.vertices.length).toBe(4);
      for (const seg of podium.segments) {
        expect(seg.hBase).toBe(0.0);
        expect(seg.hTop).toBe(30.0);
      }

      // Wspólna grupa
      expect(tower.groupId).toBe('group-osm-bld-501');
      expect(podium.groupId).toBe('group-osm-bld-501');
    });

    it('ignores full outline way when relation has building:part members (prevents duplicate shell)', () => {
      const mockResponse: OverpassResponse = {
        elements: [
          // Outline of the whole building
          { type: 'node', id: 1, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 2, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 3, lat: 52.3995, lon: 16.9240 },
          { type: 'node', id: 4, lat: 52.3995, lon: 16.9230 },
          {
            type: 'way',
            id: 1000,
            nodes: [1, 2, 3, 4, 1],
            tags: { building: 'hotel', name: 'Hotel Grand' },
          },

          // Part 1: Wing A
          { type: 'node', id: 11, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 12, lat: 52.3990, lon: 16.9235 },
          { type: 'node', id: 13, lat: 52.3995, lon: 16.9235 },
          { type: 'node', id: 14, lat: 52.3995, lon: 16.9230 },
          {
            type: 'way',
            id: 1001,
            nodes: [11, 12, 13, 14, 11],
            tags: { 'building:part': 'yes', height: '40 m' },
          },

          // Part 2: Wing B
          { type: 'node', id: 21, lat: 52.3990, lon: 16.9235 },
          { type: 'node', id: 22, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 23, lat: 52.3995, lon: 16.9240 },
          { type: 'node', id: 24, lat: 52.3995, lon: 16.9235 },
          {
            type: 'way',
            id: 1002,
            nodes: [21, 22, 23, 24, 21],
            tags: { 'building:part': 'yes', height: '20 m' },
          },

          // Relation
          {
            type: 'relation',
            id: 2000,
            members: [
              { type: 'way', ref: 1000, role: 'outline' },
              { type: 'way', ref: 1001, role: 'part' },
              { type: 'way', ref: 1002, role: 'part' },
            ],
            tags: {
              type: 'building',
              name: 'Hotel Grand',
            },
          },
        ],
      };

      const buildings = parseOverpassBuildingsResponse(mockResponse, mockProjectCenter, EPSG_2180, 200);
      // Musi powstać dokładnie 2 obiekty (Wing A i Wing B), a nie 3 (bez zdublowanego outline)
      expect(buildings.length).toBe(2);
      expect(buildings.some((b) => b.id === 'osm-bld-1000')).toBe(false);
      expect(buildings.some((b) => b.id === 'osm-part-1001')).toBe(true);
      expect(buildings.some((b) => b.id === 'osm-part-1002')).toBe(true);
    });
  });
});
