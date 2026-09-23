import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveBuildingType,
  extractOsmBuildingElevation,
  formatOsmBuildingName,
  parseOverpassBuildingsResponse,
  findIncompleteRelations,
  findMissingBuildingRelationIds,
  fetchOsmBuildings,
  mergeOverpassResponses,
  OverpassResponse,
} from './osmBuildingsClient';
import { latLonToBbox } from '../shared/geocoding';
import { CrsDetectionResult, LatLon } from '../../../../utils/geoTransform';
import { WfsBbox } from '../city/wfsWarsawClient';
import { formatWfsProgress } from '../../store/useWfsStore';

const EPSG_2180: CrsDetectionResult = {
  crs: 'EPSG:2180',
  description: 'PL-1992 (EPSG:2180)',
  geodeticLabel: 'ETRF2000-PL / CS1992',
  isGeodetic: true,
};

describe('osmBuildingsClient', () => {
  describe('formatWfsProgress', () => {
    it('prioritizes status.info when present', () => {
      expect(
        formatWfsProgress({
          isFetching: true,
          stage: 'buildings',
          progressDone: 1,
          progressTotal: 2,
          buildingsCount: 0,
          parcelsCount: 0,
          treesCount: 0,
          error: null,
          info: 'Znaleziono 42 budynków. Pobieranie szczegółów 3D...',
        })
      ).toBe('Znaleziono 42 budynków. Pobieranie szczegółów 3D...');
    });

    it('falls back to stage and percentage when info is null', () => {
      expect(
        formatWfsProgress({
          isFetching: true,
          stage: 'buildings',
          progressDone: 5,
          progressTotal: 10,
          buildingsCount: 0,
          parcelsCount: 0,
          treesCount: 0,
          error: null,
          info: null,
        })
      ).toBe('Pobieranie budynków… 5 z 10 (50%)');
    });
  });
  describe('mergeOverpassResponses (safe merge preserving tags)', () => {
    it('preserves tags when merged with a skeleton entry (tags: undefined from out skel qt)', () => {
      const resp1: OverpassResponse = {
        elements: [
          {
            type: 'way',
            id: 238291407,
            nodes: [1, 2, 3, 1],
            tags: { 'building:part': 'yes', height: '107', 'building:levels': '39' },
          },
        ],
      };
      const resp2: OverpassResponse = {
        elements: [
          {
            type: 'way',
            id: 238291407,
            nodes: [1, 2, 3, 1],
            tags: undefined,
          },
        ],
      };

      const merged = mergeOverpassResponses(resp1, resp2);
      expect(merged.elements.length).toBe(1);
      const way = merged.elements[0] as any;
      expect(way.tags).toBeDefined();
      expect(way.tags.height).toBe('107');
      expect(way.tags['building:levels']).toBe('39');
    });

    it('combines multiple responses without losing nodes, ways or relations', () => {
      const resp1: OverpassResponse = {
        elements: [
          { type: 'node', id: 1, lat: 52.254, lon: 20.996 },
          { type: 'way', id: 100, nodes: [1], tags: { building: 'yes' } },
        ],
      };
      const resp2: OverpassResponse = {
        elements: [
          { type: 'node', id: 2, lat: 52.255, lon: 20.997 },
          { type: 'way', id: 200, nodes: [2], tags: { 'building:part': 'yes' } },
          { type: 'relation', id: 300, members: [{ type: 'way', ref: 100, role: 'outline' }], tags: { type: 'building' } },
        ],
      };

      const merged = mergeOverpassResponses(resp1, resp2);
      expect(merged.elements.length).toBe(5);
    });
  });
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

    it('assigns a courtyard hole only to the outer ring that geometrically contains it, not to every outer ring of a multi-outer-ring relation', () => {
      const mockResponse: OverpassResponse = {
        elements: [
          // Outer ring A: square with a courtyard inside it
          { type: 'node', id: 1, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 2, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 3, lat: 52.4000, lon: 16.9240 },
          { type: 'node', id: 4, lat: 52.4000, lon: 16.9230 },
          { type: 'way', id: 201, nodes: [1, 2, 3, 4, 1] },

          // Outer ring B: a fully separate square, far away, with NO courtyard
          { type: 'node', id: 11, lat: 52.4100, lon: 16.9400 },
          { type: 'node', id: 12, lat: 52.4100, lon: 16.9410 },
          { type: 'node', id: 13, lat: 52.4110, lon: 16.9410 },
          { type: 'node', id: 14, lat: 52.4110, lon: 16.9400 },
          { type: 'way', id: 202, nodes: [11, 12, 13, 14, 11] },

          // Inner ring (courtyard), geometrically inside outer ring A only
          { type: 'node', id: 5, lat: 52.3993, lon: 16.9233 },
          { type: 'node', id: 6, lat: 52.3993, lon: 16.9237 },
          { type: 'node', id: 7, lat: 52.3997, lon: 16.9237 },
          { type: 'node', id: 8, lat: 52.3997, lon: 16.9233 },
          { type: 'way', id: 203, nodes: [5, 6, 7, 8, 5] },

          // Relation with two disjoint outer rings + one inner ring
          {
            type: 'relation',
            id: 302,
            members: [
              { type: 'way', ref: 201, role: 'outer' },
              { type: 'way', ref: 202, role: 'outer' },
              { type: 'way', ref: 203, role: 'inner' },
            ],
            tags: {
              building: 'university',
              name: 'Kampus',
              type: 'multipolygon',
            },
          },
        ],
      };

      const buildings = parseOverpassBuildingsResponse(mockResponse, mockProjectCenter, EPSG_2180, 5000);
      expect(buildings.length).toBe(2);

      const withHole = buildings.find((b) => (b.holes?.length ?? 0) > 0);
      const withoutHole = buildings.find((b) => (b.holes?.length ?? 0) === 0);

      expect(withHole).toBeDefined();
      expect(withoutHole).toBeDefined();
      expect(withHole?.holes?.length).toBe(1);
      expect(withoutHole?.holes ?? []).toHaveLength(0);
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

    it('rejects a plain building=yes envelope way (no relation) that geometrically covers building:part ways, and groups the parts', () => {
      const mockResponse: OverpassResponse = {
        elements: [
          // Envelope: plain building=yes way covering both parts below, no relation at all
          { type: 'node', id: 1, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 2, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 3, lat: 52.3995, lon: 16.9240 },
          { type: 'node', id: 4, lat: 52.3995, lon: 16.9230 },
          {
            type: 'way',
            id: 3000,
            nodes: [1, 2, 3, 4, 1],
            tags: { building: 'yes', name: 'Envelope Bez Relacji' },
          },

          // Part 1
          { type: 'node', id: 11, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 12, lat: 52.3990, lon: 16.9235 },
          { type: 'node', id: 13, lat: 52.3995, lon: 16.9235 },
          { type: 'node', id: 14, lat: 52.3995, lon: 16.9230 },
          {
            type: 'way',
            id: 3001,
            nodes: [11, 12, 13, 14, 11],
            tags: { 'building:part': 'yes', height: '40 m' },
          },

          // Part 2
          { type: 'node', id: 21, lat: 52.3990, lon: 16.9235 },
          { type: 'node', id: 22, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 23, lat: 52.3995, lon: 16.9240 },
          { type: 'node', id: 24, lat: 52.3995, lon: 16.9235 },
          {
            type: 'way',
            id: 3002,
            nodes: [21, 22, 23, 24, 21],
            tags: { 'building:part': 'yes', height: '20 m' },
          },
        ],
      };

      const buildings = parseOverpassBuildingsResponse(mockResponse, mockProjectCenter, EPSG_2180, 200);
      expect(buildings.length).toBe(2);
      expect(buildings.some((b) => b.id === 'osm-bld-3000')).toBe(false);

      const part1 = buildings.find((b) => b.id === 'osm-part-3001')!;
      const part2 = buildings.find((b) => b.id === 'osm-part-3002')!;
      expect(part1).toBeDefined();
      expect(part2).toBeDefined();
      expect(part1.groupId).toBeDefined();
      expect(part1.groupId).toBe(part2.groupId);
    });

    it('rejects a multipolygon-relation envelope (building=yes, no building:part members) that geometrically covers unrelated building:part ways, and groups the parts', () => {
      const mockResponse: OverpassResponse = {
        elements: [
          // Envelope outer ring, wrapped in a plain multipolygon relation with no part members
          { type: 'node', id: 1, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 2, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 3, lat: 52.3995, lon: 16.9240 },
          { type: 'node', id: 4, lat: 52.3995, lon: 16.9230 },
          { type: 'way', id: 4000, nodes: [1, 2, 3, 4, 1] },
          {
            type: 'relation',
            id: 5000,
            members: [{ type: 'way', ref: 4000, role: 'outer' }],
            tags: { type: 'multipolygon', building: 'yes', name: 'Envelope Relacja' },
          },

          // Part 1 (not a member of relation 5000)
          { type: 'node', id: 11, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 12, lat: 52.3990, lon: 16.9235 },
          { type: 'node', id: 13, lat: 52.3995, lon: 16.9235 },
          { type: 'node', id: 14, lat: 52.3995, lon: 16.9230 },
          {
            type: 'way',
            id: 4001,
            nodes: [11, 12, 13, 14, 11],
            tags: { 'building:part': 'yes', height: '40 m' },
          },

          // Part 2 (not a member of relation 5000)
          { type: 'node', id: 21, lat: 52.3990, lon: 16.9235 },
          { type: 'node', id: 22, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 23, lat: 52.3995, lon: 16.9240 },
          { type: 'node', id: 24, lat: 52.3995, lon: 16.9235 },
          {
            type: 'way',
            id: 4002,
            nodes: [21, 22, 23, 24, 21],
            tags: { 'building:part': 'yes', height: '20 m' },
          },
        ],
      };

      const buildings = parseOverpassBuildingsResponse(mockResponse, mockProjectCenter, EPSG_2180, 200);
      expect(buildings.length).toBe(2);
      expect(buildings.some((b) => b.id === 'osm-bld-rel-5000')).toBe(false);

      const part1 = buildings.find((b) => b.id === 'osm-part-4001')!;
      const part2 = buildings.find((b) => b.id === 'osm-part-4002')!;
      expect(part1).toBeDefined();
      expect(part2).toBeDefined();
      expect(part1.groupId).toBeDefined();
      expect(part1.groupId).toBe(part2.groupId);
    });

    it('does not affect an unrelated, non-overlapping building:part way (control case)', () => {
      const mockResponse: OverpassResponse = {
        elements: [
          // Envelope
          { type: 'node', id: 1, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 2, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 3, lat: 52.3995, lon: 16.9240 },
          { type: 'node', id: 4, lat: 52.3995, lon: 16.9230 },
          {
            type: 'way',
            id: 6000,
            nodes: [1, 2, 3, 4, 1],
            tags: { building: 'yes', name: 'Envelope' },
          },

          // Covered part
          { type: 'node', id: 11, lat: 52.3990, lon: 16.9230 },
          { type: 'node', id: 12, lat: 52.3990, lon: 16.9240 },
          { type: 'node', id: 13, lat: 52.3995, lon: 16.9240 },
          { type: 'node', id: 14, lat: 52.3995, lon: 16.9230 },
          {
            type: 'way',
            id: 6001,
            nodes: [11, 12, 13, 14, 11],
            tags: { 'building:part': 'yes', height: '40 m' },
          },

          // Far-away, non-overlapping building:part - should be imported normally, ungrouped
          { type: 'node', id: 31, lat: 52.4100, lon: 16.9500 },
          { type: 'node', id: 32, lat: 52.4100, lon: 16.9505 },
          { type: 'node', id: 33, lat: 52.4105, lon: 16.9505 },
          { type: 'node', id: 34, lat: 52.4105, lon: 16.9500 },
          {
            type: 'way',
            id: 6002,
            nodes: [31, 32, 33, 34, 31],
            tags: { 'building:part': 'yes', height: '10 m' },
          },
        ],
      };

      const buildings = parseOverpassBuildingsResponse(mockResponse, mockProjectCenter, EPSG_2180);
      const farPart = buildings.find((b) => b.id === 'osm-part-6002');
      expect(farPart).toBeDefined();
      expect(farPart!.groupId).toBeUndefined();
    });

    it('keeps a large building=yes envelope when only a small building:part fraction of it is covered (regression for disappearing complex outline)', () => {
      const mockResponse: OverpassResponse = {
        elements: [
          // Large envelope: a big multi-part complex footprint
          { type: 'node', id: 1, lat: 52.3990, lon: 16.9200 },
          { type: 'node', id: 2, lat: 52.3990, lon: 16.9300 },
          { type: 'node', id: 3, lat: 52.4000, lon: 16.9300 },
          { type: 'node', id: 4, lat: 52.4000, lon: 16.9200 },
          {
            type: 'way',
            id: 7000,
            nodes: [1, 2, 3, 4, 1],
            tags: { building: 'commercial', name: 'Duzy Kompleks', height: '24' },
          },

          // Small building:part covering only a sliver of the envelope's own area,
          // but >50% of its own (tiny) area is inside the envelope.
          { type: 'node', id: 11, lat: 52.3990, lon: 16.9200 },
          { type: 'node', id: 12, lat: 52.3990, lon: 16.9205 },
          { type: 'node', id: 13, lat: 52.3995, lon: 16.9205 },
          { type: 'node', id: 14, lat: 52.3995, lon: 16.9200 },
          {
            type: 'way',
            id: 7001,
            nodes: [11, 12, 13, 14, 11],
            tags: { 'building:part': 'yes', height: '8' },
          },
        ],
      };

      const buildings = parseOverpassBuildingsResponse(mockResponse, mockProjectCenter, EPSG_2180, 5000);

      // The envelope must survive: the small part only accounts for a fraction of its area,
      // so the rest of the real building volume must not disappear.
      const envelope = buildings.find((b) => b.id === 'osm-bld-7000');
      expect(envelope).toBeDefined();

      const part = buildings.find((b) => b.id === 'osm-part-7001')!;
      expect(part).toBeDefined();
      expect(part.groupId).toBeDefined();
    });

    it('detects enclosed building:part as a courtyard hole in outer building (Pokorna 2 pattern)', () => {
      const mockResponse: OverpassResponse = {
        elements: [
          // Outer perimeter building (17 storeys, 51.5m)
          { type: 'node', id: 1, lat: 52.2540, lon: 20.9930 },
          { type: 'node', id: 2, lat: 52.2540, lon: 20.9960 },
          { type: 'node', id: 3, lat: 52.2560, lon: 20.9960 },
          { type: 'node', id: 4, lat: 52.2560, lon: 20.9930 },
          {
            type: 'way',
            id: 1085333897,
            nodes: [1, 2, 3, 4, 1],
            tags: { building: 'apartments', 'building:levels': '17', 'addr:street': 'Pokorna', 'addr:housenumber': '2' },
          },

          // Inner courtyard part (1 storey, 3.5m) located completely inside the outer perimeter
          { type: 'node', id: 11, lat: 52.2545, lon: 20.9940 },
          { type: 'node', id: 12, lat: 52.2545, lon: 20.9950 },
          { type: 'node', id: 13, lat: 52.2555, lon: 20.9950 },
          { type: 'node', id: 14, lat: 52.2555, lon: 20.9940 },
          {
            type: 'way',
            id: 1085333896,
            nodes: [11, 12, 13, 14, 11],
            tags: { 'building:part': 'yes', 'building:levels': '1' },
          },
        ],
      };

      const testCenter: LatLon = { lat: 52.2550, lon: 20.9950 };
      const buildings = parseOverpassBuildingsResponse(mockResponse, testCenter, EPSG_2180, 500);

      // 1. Outer building must survive with holes array populated
      const outer = buildings.find((b) => b.id === 'osm-bld-1085333897');
      expect(outer).toBeDefined();
      expect(outer!.name).toBe('Pokorna 2');
      expect(outer!.defaultHeight).toBeCloseTo(51.5, 1);
      expect(outer!.holes).toBeDefined();
      expect(outer!.holes!.length).toBe(1);
      expect(outer!.holes![0].length).toBe(4);

      // 2. Inner courtyard part must be imported with height 3.5m, inherited name and shared groupId
      const inner = buildings.find((b) => b.id === 'osm-part-1085333896');
      expect(inner).toBeDefined();
      expect(inner!.name).toBe('Pokorna 2');
      expect(inner!.defaultHeight).toBeCloseTo(3.5, 1);
      expect(inner!.groupId).toBeDefined();
      expect(inner!.groupId).toBe(outer!.groupId);
    });
  });

  describe('Rotunda PKO (real Overpass fixture, way 743253236 + relations 13114286/13114287)', () => {
    // Dane pobrane na żywo z Overpass API (overpass-api.de) 2026-09-20 dla:
    // [out:json];(relation(13114286);relation(13114287);way(743253236);way(975317925);way(975317926);>;);out body;
    // Weryfikuje naprawę: relacje multipolygon oznaczone WYŁĄCZNIE `building:part` (bez tagu `building`)
    // muszą importować się jako CZĘŚCI (`osm-part-rel-*`), a nie jako pełne budynki (`osm-bld-rel-*`),
    // a nazwa/adres z pełnego obrysu `building=commercial` (way 743253236, 'Rotunda PKO') musi być
    // odziedziczona przez relację-envelope, która sama nie ma tagu name.
    const rotundaRawElements: OverpassResponse['elements'] = [
      { type: 'node', id: 4447765348, lat: 52.2304913, lon: 21.012604 },
      { type: 'node', id: 6957140147, lat: 52.2306089, lon: 21.0123028 },
      { type: 'node', id: 6957140148, lat: 52.2306033, lon: 21.0122718 },
      { type: 'node', id: 6957140149, lat: 52.2303107, lon: 21.0122831 },
      { type: 'node', id: 6957140150, lat: 52.2303043, lon: 21.0123806 },
      { type: 'node', id: 6957140151, lat: 52.2303215, lon: 21.0124755 },
      { type: 'node', id: 6957140152, lat: 52.2305237, lon: 21.0121303 },
      { type: 'node', id: 6957140153, lat: 52.2305039, lon: 21.0121179 },
      { type: 'node', id: 6957140154, lat: 52.2304653, lon: 21.0121069 },
      { type: 'node', id: 6957140155, lat: 52.2304049, lon: 21.012122 },
      { type: 'node', id: 6957140156, lat: 52.2303695, lon: 21.0121522 },
      { type: 'node', id: 6957140157, lat: 52.2303293, lon: 21.0122195 },
      { type: 'node', id: 6957140158, lat: 52.2303446, lon: 21.0125287 },
      { type: 'node', id: 6957140159, lat: 52.2303932, lon: 21.0125865 },
      { type: 'node', id: 6957140160, lat: 52.2304313, lon: 21.012606 },
      { type: 'node', id: 6957140161, lat: 52.2304713, lon: 21.0126089 },
      { type: 'node', id: 6957140162, lat: 52.2305293, lon: 21.0125816 },
      { type: 'node', id: 6957140163, lat: 52.2305623, lon: 21.0125441 },
      { type: 'node', id: 6957140164, lat: 52.2305982, lon: 21.0124644 },
      { type: 'node', id: 6957140165, lat: 52.2306103, lon: 21.0124018 },
      { type: 'node', id: 6957140166, lat: 52.230585, lon: 21.0122145 },
      { type: 'node', id: 6957140167, lat: 52.2306121, lon: 21.0123357 },
      { type: 'node', id: 6957140168, lat: 52.2305412, lon: 21.0121461 },
      { type: 'node', id: 6957140169, lat: 52.2304119, lon: 21.0125982 },
      { type: 'node', id: 6957140170, lat: 52.2303315, lon: 21.0125023 },
      { type: 'node', id: 6957140171, lat: 52.230304, lon: 21.0123423 },
      { type: 'node', id: 6957140172, lat: 52.2303394, lon: 21.0121973 },
      { type: 'node', id: 6957140173, lat: 52.2303862, lon: 21.0121356 },
      { type: 'node', id: 6957140174, lat: 52.2304245, lon: 21.0121126 },
      { type: 'node', id: 6957140175, lat: 52.2304847, lon: 21.0121103 },
      { type: 'node', id: 6957140176, lat: 52.2305951, lon: 21.0122416 },
      { type: 'node', id: 6957140177, lat: 52.2305884, lon: 21.0124935 },
      { type: 'node', id: 6957140178, lat: 52.2305126, lon: 21.0125937 },
      { type: 'node', id: 6957140179, lat: 52.2304515, lon: 21.0126096 },
      { type: 'node', id: 6957140180, lat: 52.2305466, lon: 21.0125646 },
      { type: 'node', id: 6957140181, lat: 52.2306056, lon: 21.0124332 },
      { type: 'node', id: 6957140182, lat: 52.2303075, lon: 21.0124135 },
      { type: 'node', id: 6957140183, lat: 52.2303584, lon: 21.0125503 },
      { type: 'node', id: 6957140184, lat: 52.2303181, lon: 21.0122521 },
      { type: 'node', id: 8388699286, lat: 52.2305724, lon: 21.0121889 },
      { type: 'node', id: 9025616933, lat: 52.2304266, lon: 21.0123864 },
      { type: 'node', id: 9025616934, lat: 52.2304232, lon: 21.0123721 },
      { type: 'node', id: 9025616935, lat: 52.2304221, lon: 21.0123569 },
      { type: 'node', id: 9025616936, lat: 52.2304236, lon: 21.0123417 },
      { type: 'node', id: 9025616937, lat: 52.2304273, lon: 21.0123276 },
      { type: 'node', id: 9025616938, lat: 52.2304332, lon: 21.0123156 },
      { type: 'node', id: 9025616939, lat: 52.2304408, lon: 21.0123064 },
      { type: 'node', id: 9025616940, lat: 52.2304496, lon: 21.0123008 },
      { type: 'node', id: 9025616941, lat: 52.230459, lon: 21.0122991 },
      { type: 'node', id: 9025616942, lat: 52.2304683, lon: 21.0123014 },
      { type: 'node', id: 9025616943, lat: 52.230477, lon: 21.0123076 },
      { type: 'node', id: 9025616944, lat: 52.2304843, lon: 21.0123171 },
      { type: 'node', id: 9025616945, lat: 52.2304899, lon: 21.0123295 },
      { type: 'node', id: 9025616946, lat: 52.2304934, lon: 21.0123438 },
      { type: 'node', id: 9025616947, lat: 52.2304944, lon: 21.0123591 },
      { type: 'node', id: 9025616948, lat: 52.230493, lon: 21.0123743 },
      { type: 'node', id: 9025616949, lat: 52.2304893, lon: 21.0123884 },
      { type: 'node', id: 9025616950, lat: 52.2304834, lon: 21.0124004 },
      { type: 'node', id: 9025616951, lat: 52.2304758, lon: 21.0124095 },
      { type: 'node', id: 9025616952, lat: 52.230467, lon: 21.0124151 },
      { type: 'node', id: 9025616953, lat: 52.2304576, lon: 21.0124169 },
      { type: 'node', id: 9025616954, lat: 52.2304483, lon: 21.0124146 },
      { type: 'node', id: 9025616955, lat: 52.2304396, lon: 21.0124084 },
      { type: 'node', id: 9025616956, lat: 52.2304322, lon: 21.0123988 },
      { type: 'node', id: 9025616957, lat: 52.2304186, lon: 21.0123937 },
      { type: 'node', id: 9025616958, lat: 52.2304142, lon: 21.0123757 },
      { type: 'node', id: 9025616959, lat: 52.2304129, lon: 21.0123566 },
      { type: 'node', id: 9025616960, lat: 52.2304147, lon: 21.0123375 },
      { type: 'node', id: 9025616961, lat: 52.2304194, lon: 21.0123198 },
      { type: 'node', id: 9025616962, lat: 52.2304268, lon: 21.0123047 },
      { type: 'node', id: 9025616963, lat: 52.2304364, lon: 21.0122933 },
      { type: 'node', id: 9025616964, lat: 52.2304474, lon: 21.0122862 },
      { type: 'node', id: 9025616965, lat: 52.2304592, lon: 21.0122841 },
      { type: 'node', id: 9025616966, lat: 52.2304709, lon: 21.012287 },
      { type: 'node', id: 9025616967, lat: 52.2304817, lon: 21.0122947 },
      { type: 'node', id: 9025616968, lat: 52.230491, lon: 21.0123067 },
      { type: 'node', id: 9025616969, lat: 52.230498, lon: 21.0123223 },
      { type: 'node', id: 9025616970, lat: 52.2305023, lon: 21.0123402 },
      { type: 'node', id: 9025616971, lat: 52.2305037, lon: 21.0123594 },
      { type: 'node', id: 9025616972, lat: 52.2305019, lon: 21.0123785 },
      { type: 'node', id: 9025616973, lat: 52.2304972, lon: 21.0123961 },
      { type: 'node', id: 9025616974, lat: 52.2304898, lon: 21.0124112 },
      { type: 'node', id: 9025616975, lat: 52.2304802, lon: 21.0124227 },
      { type: 'node', id: 9025616976, lat: 52.2304692, lon: 21.0124297 },
      { type: 'node', id: 9025616977, lat: 52.2304574, lon: 21.0124319 },
      { type: 'node', id: 9025616978, lat: 52.2304457, lon: 21.012429 },
      { type: 'node', id: 9025616979, lat: 52.2304349, lon: 21.0124213 },
      { type: 'node', id: 9025616980, lat: 52.2304256, lon: 21.0124092 },
      { type: 'node', id: 13140081208, lat: 52.2303134, lon: 21.012446 },
      { type: 'node', id: 13140081209, lat: 52.230306, lon: 21.0123144 },
      { type: 'node', id: 13140081210, lat: 52.2303538, lon: 21.0121727 },
      { type: 'node', id: 13140081211, lat: 52.2304445, lon: 21.0121076 },
      { type: 'node', id: 13140081212, lat: 52.2305577, lon: 21.0121658 },
      { type: 'node', id: 13140081213, lat: 52.2306125, lon: 21.0123713 },
      { type: 'node', id: 13140081214, lat: 52.2305766, lon: 21.0125199 },
      { type: 'node', id: 13140081215, lat: 52.2303759, lon: 21.0125712 },
      { type: 'way', id: 743253236, nodes: [6957140158, 6957140183, 13140081215, 6957140159, 6957140169, 6957140160, 6957140179, 6957140161, 4447765348, 6957140178, 6957140162, 6957140180, 6957140163, 13140081214, 6957140177, 6957140164, 6957140181, 6957140165, 13140081213, 6957140167, 6957140147, 6957140148, 6957140176, 6957140166, 8388699286, 13140081212, 6957140168, 6957140152, 6957140153, 6957140175, 6957140154, 13140081211, 6957140174, 6957140155, 6957140173, 6957140156, 13140081210, 6957140172, 6957140157, 6957140184, 6957140149, 13140081209, 6957140171, 6957140150, 6957140182, 13140081208, 6957140151, 6957140170, 6957140158], tags: { "addr:city": "Warszawa", "addr:city:simc": "0918123", "addr:housenumber": "100/102", "addr:street": "Marszałkowska", "alt_name": "Rotunda", "building": "commercial", "building:levels": "3", "height": "14", "name": "Rotunda PKO", "roof:levels": "0", "roof:shape": "many", "source:addr": "mapa.um.warszawa.pl", "wikidata": "Q668337", "wikipedia": "pl:Rotunda PKO w Warszawie" } },
      { type: 'way', id: 975317925, nodes: [9025616956, 9025616955, 9025616954, 9025616953, 9025616952, 9025616951, 9025616950, 9025616949, 9025616948, 9025616947, 9025616946, 9025616945, 9025616944, 9025616943, 9025616942, 9025616941, 9025616940, 9025616939, 9025616938, 9025616937, 9025616936, 9025616935, 9025616934, 9025616933, 9025616956], tags: { "building:part": "yes", "height": "12.5", "roof:colour": "#4B785C", "roof:material": "glass", "roof:shape": "flat" } },
      { type: 'way', id: 975317926, nodes: [9025616980, 9025616979, 9025616978, 9025616977, 9025616976, 9025616975, 9025616974, 9025616973, 9025616972, 9025616971, 9025616970, 9025616969, 9025616968, 9025616967, 9025616966, 9025616965, 9025616964, 9025616963, 9025616962, 9025616961, 9025616960, 9025616959, 9025616958, 9025616957, 9025616980], tags: {} },
      { type: 'relation', id: 13114286, members: [{ type: 'way', ref: 975317926, role: 'inner' }, { type: 'way', ref: 743253236, role: 'outer' }], tags: { "building:colour": "#4B785C", "building:levels": "3", "building:material": "glass", "building:part": "yes", "height": "14", "roof:colour": "#F8F8F8", "roof:height": "2", "roof:material": "metal", "roof:shape": "skillion", "type": "multipolygon" } },
      { type: 'relation', id: 13114287, members: [{ type: 'way', ref: 975317925, role: 'inner' }, { type: 'way', ref: 975317926, role: 'outer' }], tags: { "building:part": "yes", "height": "12.5", "roof:colour": "#F8F8F8", "roof:material": "metal", "roof:shape": "flat", "type": "multipolygon" } },
    ];
    const mockProjectCenter = { lat: 52.2304, lon: 21.0123 };

    // (b) end-to-end: pełny pipeline od surowej odpowiedzi Overpass do BuildingLoop z groupId.
    it('imports the way (743253236) as skipped (relation outer member) and both relations as parts with correct ids/category', () => {
      const buildings = parseOverpassBuildingsResponse({ elements: rotundaRawElements }, mockProjectCenter, EPSG_2180);

      expect(buildings.some((b) => b.id === 'osm-bld-743253236')).toBe(false);

      const outer = buildings.find((b) => b.id === 'osm-part-rel-13114286');
      const inner = buildings.find((b) => b.id === 'osm-part-rel-13114287');
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
      expect(outer!.category).toBe('building');
      expect(inner!.category).toBe('building');
    });

    it('inherits the name/address from the outer way (Rotunda PKO) when the relation itself has no name tag', () => {
      const buildings = parseOverpassBuildingsResponse({ elements: rotundaRawElements }, mockProjectCenter, EPSG_2180);
      const outer = buildings.find((b) => b.id === 'osm-part-rel-13114286')!;
      expect(outer.name).toBe('Rotunda PKO');
    });

    // (c) identity/regresja: jawna asercja na znormalizowanej projekcji wyniku (id/groupId/liczba
    // wierzchołków/nazwa), bez surowych współrzędnych zmiennoprzecinkowych - stabilna między refaktorami.
    it('has a hole (inner ring) on the outer part, with vertex counts no larger than the raw OSM node counts', () => {
      const buildings = parseOverpassBuildingsResponse({ elements: rotundaRawElements }, mockProjectCenter, EPSG_2180);
      const outer = buildings.find((b) => b.id === 'osm-part-rel-13114286')!;
      const inner = buildings.find((b) => b.id === 'osm-part-rel-13114287')!;

      // Way 743253236 (outer ring) ma 48 unikalnych węzłów w surowych danych OSM - sanityzacja
      // może usunąć degenerowane/prawie-współliniowe punkty, ale nigdy nie dodaje nowych.
      expect(outer.vertices.length).toBeGreaterThan(0);
      expect(outer.vertices.length).toBeLessThanOrEqual(48);
      expect(outer.holes).toBeDefined();
      expect(outer.holes!.length).toBe(1);
      // Way 975317926 (inner ring / outer ring dla 13114287) ma 24 unikalne węzły.
      expect(outer.holes![0].length).toBeLessThanOrEqual(24);

      expect(inner.vertices.length).toBeGreaterThan(0);
      expect(inner.vertices.length).toBeLessThanOrEqual(24);
      expect(inner.holes).toBeDefined();
      expect(inner.holes!.length).toBe(1);
      // Way 975317925 (najbardziej wewnętrzny otwór) ma 24 unikalne węzły.
      expect(inner.holes![0].length).toBeLessThanOrEqual(24);
    });

    // (a) live: pobiera rzeczywiste dane z Overpass API dla obszaru Rotundy PKO, żeby potwierdzić,
    // że aktualny stan danych OSM wciąż daje ten sam wzorzec grupowania. Nigdy w domyślnym `npm test`.
    const RUN_LIVE = process.env.OSM_LIVE_TEST === '1';
    (RUN_LIVE ? it : it.skip)(
      'live: fetchOsmBuildings groups Rotunda PKO parts into one logical building from real Overpass data',
      async () => {
        const { fetchOsmBuildings } = await import('./osmBuildingsClient');
        const bbox: [number, number, number, number] = [21.0120, 52.2303, 21.0127, 52.2307];
        const buildings = await fetchOsmBuildings(bbox, mockProjectCenter, EPSG_2180);

        const parts = buildings.filter((b) => b.id.startsWith('osm-part-rel-131142'));
        expect(parts.length).toBeGreaterThanOrEqual(2);
        const groupIds = new Set(parts.map((b) => b.groupId));
        expect(groupIds.size).toBe(1);
        expect(groupIds.has(undefined)).toBe(false);
      },
      30000
    );
  });

  describe('Intraco tower (real OSM fixture, relation 3211736 + way 238291407)', () => {
    // Dane pobrane na żywo z `api.openstreetmap.org/api/0.6/map` (nie Overpass — mirrory
    // Overpass były niedostępne z tej sieci w momencie diagnozy) dla obwiedni 300 m wokół
    // 52.2545839, 20.996694 — regresja dla zgłoszenia: wieżowiec "Intraco" (relacja
    // `type=building` BEZ własnego tagu `building`, schemat "Simple 3D Buildings") całkowicie
    // znikał z importu, mimo że dane źródłowe w OSM są kompletne i budynek leży ~35-47 m od
    // środka zapytania. Way 238291407 (`building:part=yes`, `height=107`, `building:min_level=2`)
    // to właściwa 107-metrowa wieża; way 238291404 to niski (2-kondygnacyjny) cokół/outline;
    // way 238560043 to niska część boczna; way 238291406 (fragment dachu) jest otagowany
    // `building=roof` zamiast `building:part=yes` i celowo NIE jest tu asercjonowany (osobny,
    // niżej priorytetowy przypadek nietypowego tagowania w samym OSM).
    const intracoRawElements: OverpassResponse['elements'] = [
      { type: 'node', id: 2461386125, lat: 52.2542311, lon: 20.9966531 },
      { type: 'node', id: 2461386127, lat: 52.2542335, lon: 20.9963084 },
      { type: 'node', id: 2461386128, lat: 52.254246, lon: 20.9968322 },
      { type: 'node', id: 2461386129, lat: 52.2542607, lon: 20.9966344 },
      { type: 'node', id: 2461386130, lat: 52.2542617, lon: 20.9966463 },
      { type: 'node', id: 2461386131, lat: 52.2542788, lon: 20.9968249 },
      { type: 'node', id: 2461386132, lat: 52.2542799, lon: 20.9968378 },
      { type: 'node', id: 2461386135, lat: 52.2543061, lon: 20.9971522 },
      { type: 'node', id: 2461386139, lat: 52.2543434, lon: 20.9966161 },
      { type: 'node', id: 2461386142, lat: 52.2543604, lon: 20.99682 },
      { type: 'node', id: 2461386149, lat: 52.2545056, lon: 20.9963604 },
      { type: 'node', id: 2461386151, lat: 52.2545577, lon: 20.9970325 },
      { type: 'node', id: 2461386152, lat: 52.2545596, lon: 20.9963492 },
      { type: 'node', id: 2461386153, lat: 52.2545615, lon: 20.9963739 },
      { type: 'node', id: 2461386155, lat: 52.2546142, lon: 20.9963378 },
      { type: 'node', id: 2461386156, lat: 52.2546161, lon: 20.9963626 },
      { type: 'node', id: 2461386158, lat: 52.2546178, lon: 20.9969936 },
      { type: 'node', id: 2461386159, lat: 52.2546199, lon: 20.9970196 },
      { type: 'node', id: 2461386163, lat: 52.2546633, lon: 20.9969842 },
      { type: 'node', id: 2461386165, lat: 52.2546652, lon: 20.997009 },
      { type: 'node', id: 2461386166, lat: 52.2546705, lon: 20.9963262 },
      { type: 'node', id: 2461386172, lat: 52.2547174, lon: 20.9962012 },
      { type: 'node', id: 2461386175, lat: 52.2547226, lon: 20.9969971 },
      { type: 'node', id: 2461386183, lat: 52.2547878, lon: 20.9970454 },
      { type: 'node', id: 2463824527, lat: 52.2543064, lon: 20.9971511 },
      { type: 'node', id: 2463824547, lat: 52.2547163, lon: 20.9962029 },
      { type: 'node', id: 2463824550, lat: 52.2547867, lon: 20.9970445 },
      { type: 'node', id: 7714820365, lat: 52.254261, lon: 20.9968289 },
      { type: 'node', id: 7714820372, lat: 52.2543522, lon: 20.9967212 },
      { type: 'node', id: 11376027723, lat: 52.2542456, lon: 20.9966499 },
      {
        type: 'way', id: 238291404,
        nodes: [2461386127, 2461386129, 2461386139, 7714820372, 2461386142, 2461386132, 2461386135, 2461386183, 2461386172, 2461386127],
        tags: { building: 'commercial', 'building:levels': '2', name: 'Intraco', old_name: 'Intraco I' },
      },
      {
        type: 'way', id: 238291406,
        nodes: [2461386130, 11376027723, 2461386125, 2461386128, 7714820365, 2461386131, 2461386132, 2461386142, 7714820372, 2461386139, 2461386129, 2461386130],
        tags: { building: 'roof', 'roof:shape': 'flat' },
      },
      {
        type: 'way', id: 238291407,
        nodes: [2461386166, 2461386155, 2461386156, 2461386153, 2461386152, 2461386149, 2461386151, 2461386159, 2461386158, 2461386163, 2461386165, 2461386175, 2461386166],
        tags: { 'building:part': 'yes', 'building:levels': '39', 'building:min_level': '2', height: '107', 'roof:shape': 'flat' },
      },
      {
        type: 'way', id: 238560043,
        nodes: [2461386127, 2461386129, 2461386139, 7714820372, 2461386142, 2461386132, 2463824527, 2463824550, 2463824547, 2461386127],
        tags: { 'building:levels': '2', 'building:part': 'yes', 'roof:shape': 'flat' },
      },
      {
        type: 'relation', id: 3211736,
        members: [
          { type: 'way', ref: 238291404, role: 'outline' },
          { type: 'way', ref: 238560043, role: 'part' },
          { type: 'way', ref: 238291407, role: 'part' },
          { type: 'way', ref: 238291406, role: 'part' },
        ],
        tags: { name: 'Intraco', type: 'building' },
      },
    ];
    const mockProjectCenter = { lat: 52.2545839, lon: 20.996694 };

    it('imports the tower part (way 238291407, height=107) as a standalone building, not just the low outline', () => {
      const buildings = parseOverpassBuildingsResponse({ elements: intracoRawElements }, mockProjectCenter, EPSG_2180, 300);
      const tower = buildings.find((b) => b.id === 'osm-part-238291407');
      expect(tower).toBeDefined();
      expect(tower!.defaultHeight).toBeGreaterThan(90);
    });

    it('does not create a duplicate low building from the relation outline way (238291404) when parts are present', () => {
      const buildings = parseOverpassBuildingsResponse({ elements: intracoRawElements }, mockProjectCenter, EPSG_2180, 300);
      expect(buildings.some((b) => b.id === 'osm-bld-238291404')).toBe(false);
    });

    it('preserves the outline as fallback building when no parts generated valid polygons (failsafe)', () => {
      // Usunięto węzły części (way 238291407 i 238560043), zostawiając tylko outline
      const outlineOnlyElements = intracoRawElements.filter(
        (el) => el.type !== 'way' || el.id === 238291404
      );
      const buildings = parseOverpassBuildingsResponse({ elements: outlineOnlyElements }, mockProjectCenter, EPSG_2180, 300);
      const outline = buildings.find((b) => b.id === 'osm-bld-238291404');
      expect(outline).toBeDefined();
      expect(outline!.name).toBe('Intraco');
    });

    it('parses overpass-turbo.json reference file for Intraco landmark within 100m radius', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const turboPath = path.resolve(process.cwd(), 'reference/osm/overpass-turbo.json');
      if (fs.existsSync(turboPath)) {
        const turboData = JSON.parse(fs.readFileSync(turboPath, 'utf8'));
        const landmarkCenter = { lat: 52.2546, lon: 20.9967 };
        const buildings100m = parseOverpassBuildingsResponse(turboData, landmarkCenter, EPSG_2180, 100);

        // Intraco (way 238291404) powinno być zaimportowane
        const intraco = buildings100m.find((b) => b.id.includes('238291404') || b.name.includes('Intraco'));
        expect(intraco).toBeDefined();

        // Intraco Prime (way 1076972425) w promieniu 100m
        const intracoPrime = buildings100m.find((b) => b.name.includes('Intraco Prime') || b.id.includes('1076972425'));
        expect(intracoPrime).toBeDefined();

        // Wszystkie zaimportowane obiekty muszą mieć poprawne segmenty i geometrię
        expect(buildings100m.length).toBeGreaterThanOrEqual(2);
        for (const b of buildings100m) {
          expect(b.vertices.length).toBeGreaterThanOrEqual(3);
          expect(b.segments.length).toBeGreaterThanOrEqual(3);
        }
      }
    });

    // Regresja: zapytanie z podwójną rekursją (`>;>;`) naprawiało brak wieży Intraco, ale
    // gubiło większość pozostałych budynków w obszarach z wieloma złożonymi zagnieżdżonymi
    // relacjami (patrz reference/osm-error5.json — 79 obiektów spadło do 11). Właściwe
    // rozwiązanie: runda 1 z pojedynczą rekursją (kompletność obszaru) + wykrycie
    // niekompletnych relacji + celowany dociąg TYLKO dla nich w rundzie 2.
    describe('findIncompleteRelations (wykrywanie kandydatów do rundy 2)', () => {
      it('returns empty for a fully complete fixture (round 1 already has all member way nodes)', () => {
        expect(findIncompleteRelations(intracoRawElements)).toEqual([]);
      });

      it('detects the relation when a member way is present but missing some of its node coordinates', () => {
        // Symuluje efekt pojedynczej rekursji z realnego Overpass: way 238291407 (wieża)
        // jest w zbiorze (trafiony bezpośrednio przez filtr way["building:part"]), ale
        // brakuje mu części węzłów (nie dociągniętych przez pojedynczy krok rekursji).
        const truncated = intracoRawElements.filter(
          (el) => !(el.type === 'node' && [2461386166, 2461386155].includes(el.id))
        );
        expect(findIncompleteRelations(truncated)).toEqual([3211736]);
      });

      it('detects the relation when a member way is entirely missing from the set', () => {
        const truncated = intracoRawElements.filter((el) => !(el.type === 'way' && el.id === 238291407));
        expect(findIncompleteRelations(truncated)).toEqual([3211736]);
      });

      it('ignores relations unrelated to buildings (no type=building/multipolygon, no building tag)', () => {
        const unrelated: OverpassResponse['elements'] = [
          { type: 'relation', id: 999, members: [{ type: 'way', ref: 111, role: '' }], tags: { type: 'route' } },
        ];
        expect(findIncompleteRelations(unrelated)).toEqual([]);
      });
    });

    // Regresja: relacja Intraco (type=building, bez własnego tagu building, tylko way-członkowie)
    // potrafi w ogóle nie zostać dopasowana przez filtr bbox Rundy 1 — wtedy findIncompleteRelations
    // nigdy jej nie zobaczy (patrz komentarz przy ROUND0_BBOX_PADDING_METERS w osmBuildingsClient.ts).
    // findMissingBuildingRelationIds wykrywa taki przypadek na podstawie obwiedni z Rundy 0.
    describe('findMissingBuildingRelationIds (Runda 0 — relacje całkowicie nieobecne w Rundzie 1)', () => {
      const intracoBounds = { minlat: 52.2536, minlon: 20.9958, maxlat: 52.2556, maxlon: 20.9978 };
      const intracoEnvelope = {
        type: 'relation' as const,
        id: 3211736,
        members: [],
        tags: { name: 'Intraco', type: 'building' },
        bounds: intracoBounds,
      };

      it('flags a building relation found only in the round-0 envelope discovery, missing entirely from round-1 elements', () => {
        expect(
          findMissingBuildingRelationIds([intracoEnvelope], [], mockProjectCenter, EPSG_2180, 300)
        ).toEqual([3211736]);
      });

      it('does not flag a relation already present in round-1 elements (avoids duplicating findIncompleteRelations candidates)', () => {
        const round1WithRelation: OverpassResponse['elements'] = [
          { type: 'relation', id: 3211736, members: [], tags: { name: 'Intraco', type: 'building' } },
        ];
        expect(
          findMissingBuildingRelationIds([intracoEnvelope], round1WithRelation, mockProjectCenter, EPSG_2180, 300)
        ).toEqual([]);
      });

      it('does not flag a relation whose envelope lies far outside the requested radius', () => {
        const farAway = { ...intracoEnvelope, id: 999, bounds: { minlat: 53.5, minlon: 22.0, maxlat: 53.51, maxlon: 22.01 } };
        expect(findMissingBuildingRelationIds([farAway], [], mockProjectCenter, EPSG_2180, 300)).toEqual([]);
      });

      it('ignores non-building relations (e.g. a route relation) even if missing from round-1', () => {
        const routeRelation = { ...intracoEnvelope, id: 555, tags: { type: 'route' } };
        expect(findMissingBuildingRelationIds([routeRelation], [], mockProjectCenter, EPSG_2180, 300)).toEqual([]);
      });
    });

    it('end-to-end: merging an incomplete round-1 result with a round-2 relation detail fetch recovers the full tower geometry', () => {
      // Runda 1 "niekompletna": way 238291407 obecny, ale bez węzłów (jak przy pojedynczej
      // rekursji, gdy Overpass nie zdążył dociągnąć jego geometrii przez relację) — dokładnie
      // scenariusz wykrywany przez findIncompleteRelations powyżej.
      const round1Incomplete = intracoRawElements.filter(
        (el) => !(el.type === 'node' && [2461386166, 2461386155, 2461386156, 2461386153].includes(el.id))
      );
      expect(findIncompleteRelations(round1Incomplete)).toEqual([3211736]);

      // Runda 2 "detail": pełne dane relacji (jak zwróciłoby celowane zapytanie
      // `relation(3211736);(._;>;>;);out body;`) — tu po prostu cały oryginalny fixture,
      // bo zawiera komplet węzłów tej relacji.
      const round2Detail = intracoRawElements;

      // Scalanie identyczne z logiką w fetchOsmBuildings: Map po `${type}:${id}`, runda 2
      // nadpisuje niekompletne wpisy z rundy 1.
      const merged = new Map<string, OverpassResponse['elements'][number]>();
      for (const el of round1Incomplete) merged.set(`${el.type}:${el.id}`, el);
      for (const el of round2Detail) merged.set(`${el.type}:${el.id}`, el);

      const buildings = parseOverpassBuildingsResponse(
        { elements: Array.from(merged.values()) },
        mockProjectCenter,
        EPSG_2180,
        300
      );
      const tower = buildings.find((b) => b.id === 'osm-part-238291407');
      expect(tower).toBeDefined();
      expect(tower!.defaultHeight).toBeGreaterThan(90);
      expect(tower!.vertices.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('fetchOsmBuildings — fidelity to proxy response (regresja: 939 vs 243 budynków dla tego samego bboxa)', () => {
    // Dwa eksporty sceny użytkownika z tej samej lokalizacji (reference/osm-error6.json: 939
    // budynków OSM, reference/osm-error7.json: 243 budynki OSM) ujawniły, że powtórzony import
    // identycznego bboxa dawał skrajnie różne wyniki — przyczyna leżała w api/osm-overpass.ts
    // (raceForNonEmpty wybierał PIERWSZY niepusty mirror zamiast najpełniejszego, patrz
    // api/osm-overpass.test.ts). Ten test pinuje kontrakt po stronie klienta: fetchOsmBuildings
    // musi wiernie odzwierciedlać to, co zwróci proxy — bez własnego cache'owania/tłumienia,
    // które mogłoby maskować taką niespójność między kolejnymi wywołaniami zamiast ją ujawniać.
    const mockProjectCenter = { lat: 52.2545839, lon: 20.996694 };
    const bbox: WfsBbox = [20.995, 52.251, 20.999, 52.256];

    function buildOverpassPayload(buildingCount: number): OverpassResponse {
      const elements: OverpassResponse['elements'] = [];
      for (let i = 0; i < buildingCount; i++) {
        const base = 20.9955 + i * 0.0001;
        const nodeIds = [i * 4 + 1, i * 4 + 2, i * 4 + 3, i * 4 + 4];
        elements.push(
          { type: 'node', id: nodeIds[0], lat: 52.2521, lon: base },
          { type: 'node', id: nodeIds[1], lat: 52.2521, lon: base + 0.00005 },
          { type: 'node', id: nodeIds[2], lat: 52.2526, lon: base + 0.00005 },
          { type: 'node', id: nodeIds[3], lat: 52.2526, lon: base },
          {
            type: 'way',
            id: 500000 + i,
            nodes: [...nodeIds, nodeIds[0]],
            tags: { building: 'yes' },
          }
        );
      }
      return { elements };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('two sequential fetchOsmBuildings calls for the identical bbox surface exactly what the proxy returned each time (939 then 243)', async () => {
      let call = 0;
      const responses = [
        buildOverpassPayload(939), // first fetchOsmBuildings - stage 1 (baseline)
        { elements: [] },          // first fetchOsmBuildings - stage 2 (details)
        buildOverpassPayload(243), // second fetchOsmBuildings - stage 1 (baseline)
        { elements: [] },          // second fetchOsmBuildings - stage 2 (details)
      ];
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          const payload = responses[call] || { elements: [] };
          call++;
          return { ok: true, json: async () => payload } as Response;
        })
      );

      const first = await fetchOsmBuildings(bbox, mockProjectCenter, EPSG_2180);
      const second = await fetchOsmBuildings(bbox, mockProjectCenter, EPSG_2180);

      expect(first.length).toBe(939);
      expect(second.length).toBe(243);
    });

    it('emits progress updates informing about found buildings count and 3D details', async () => {
      const progressUpdates: any[] = [];
      const responses = [
        buildOverpassPayload(10), // stage 1 (baseline)
        { elements: [] },         // stage 2 (details)
      ];
      let call = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          const payload = responses[call] || { elements: [] };
          call++;
          return { ok: true, json: async () => payload } as Response;
        })
      );

      await fetchOsmBuildings(bbox, mockProjectCenter, EPSG_2180, 200, (p) => {
        progressUpdates.push(p);
      });

      expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
      expect(progressUpdates.some((p) => p.stage === 'baseline')).toBe(true);
      const detailsProgress = progressUpdates.find((p) => p.stage === 'details');
      expect(detailsProgress).toBeDefined();
      expect(detailsProgress.foundBuildingsCount).toBe(10);
      expect(detailsProgress.message).toContain('10 budynków');
    });
  });

  describe('Intraco tower — live radius sweep (diagnostic)', () => {
    // Diagnostyka, NIE regresja: zgłoszenie mówi, że wieża Intraco (relacja 3211736) znika
    // z importu, ale nie wiadomo na pewno DLACZEGO — czy relacja w ogóle nie jest dopasowywana
    // przez filtr bbox Rundy 1 przy małym promieniu (za ciasny bbox), czy jest dopasowywana ale
    // pojedyncza rekursja daje niekompletną geometrię niewykrywaną przez findIncompleteRelations
    // (mirror-zależność / kształt niekompletności), czy geometria jest poprawnie dociągnięta w
    // rundzie 2, ale coś ją odrzuca później w parseOverpassBuildingsResponse (np. reguła 85%
    // pokrycia envelope-vs-parts). Ten test sprawdza żywe dane Overpass dla rosnącego promienia
    // i loguje tabelę faktów, zamiast zakładać z góry, która hipoteza jest prawdziwa — wynik
    // steruje wyborem właściwej poprawki (patrz plan). Nigdy w domyślnym `npm test`.
    const RUN_LIVE = process.env.OSM_LIVE_TEST === '1';
    const INTRACO_RELATION_ID = 3211736;
    const mockProjectCenter = { lat: 52.2545839, lon: 20.996694 };

    async function fetchRound1Raw(bbox: [number, number, number, number]): Promise<OverpassResponse> {
      const [west, south, east, north] = bbox;
      const query = `
        [out:json][timeout:45];
        (
          way["building"](${south},${west},${north},${east});
          way["building:part"](${south},${west},${north},${east});
          relation["building"]["type"="multipolygon"](${south},${west},${north},${east});
          relation["building:part"]["type"="multipolygon"](${south},${west},${north},${east});
          relation["type"="building"](${south},${west},${north},${east});
        );
        out body;
        >;
        out skel qt;
      `.trim();
      const res = await fetch('http://localhost:3000/api/osm-overpass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(`round-1 fetch failed: HTTP ${res.status}`);
      return (await res.json()) as OverpassResponse;
    }

    // Wymaga uruchomionego `npm run dev` (localhost:3000) — `fetchOsmBuildings` woła produkcyjny
    // relatywny URL `/api/osm-overpass`, który pod Node/vitest (bez bazowego URL) nie zadziała
    // bez lokalnego serwera dev obsługującego middleware `/api/**` (patrz CLAUDE.md).
    (RUN_LIVE ? it : it.skip)(
      'sweeps radius 100/200/300/500m against live Overpass and reports where the tower does/does not survive each stage',
      async () => {
        const { fetchOsmBuildings } = await import('./osmBuildingsClient');

        // `fetchOsmBuildings` woła produkcyjny relatywny URL `/api/osm-overpass` — pod
        // Node/vitest (brak `document.baseURI`) taki fetch rzuca `Invalid URL`, więc na czas
        // tego testu podmieniamy global fetch, żeby dopisywał bazowy adres dev-serwera tylko
        // dla żądań zaczynających się od "/".
        const originalFetch = globalThis.fetch;
        globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
          if (typeof input === 'string' && input.startsWith('/')) {
            return originalFetch(`http://localhost:3000${input}`, init);
          }
          return originalFetch(input, init);
        }) as typeof fetch;

        const radii = [100, 200, 300, 500];
        const rows: Array<{
          radius: number;
          matchedInRound1: boolean;
          flaggedIncomplete: boolean;
          finalHasTower: boolean;
        }> = [];

        try {
          for (const radius of radii) {
            const bbox = latLonToBbox(mockProjectCenter.lat, mockProjectCenter.lon, radius);

            const round1 = await fetchRound1Raw(bbox);
            const matchedInRound1 = round1.elements.some(
              (el) => el.type === 'relation' && el.id === INTRACO_RELATION_ID
            );
            const flaggedIncomplete = matchedInRound1 && findIncompleteRelations(round1.elements).includes(INTRACO_RELATION_ID);

            const buildings = await fetchOsmBuildings(bbox, mockProjectCenter, EPSG_2180, radius);
            const finalHasTower = buildings.some((b) => b.defaultHeight > 90);

            rows.push({ radius, matchedInRound1, flaggedIncomplete, finalHasTower });

            // Sanity check logiki testu (nie systemu pod testem): budynek nie może pojawić się w
            // finalnym wyniku, jeśli relacja w ogóle nie została dopasowana w rundzie 1 i nie
            // została dociągnięta przez rundę 2 — czyli finalHasTower=>matchedInRound1.
            if (finalHasTower) expect(matchedInRound1).toBe(true);
          }
        } finally {
          globalThis.fetch = originalFetch;
        }

        // eslint-disable-next-line no-console
        console.table(rows);
      },
      300000
    );
  });
});
