import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatQuadrantKey,
  formatPartsBatchKey,
  formatAssembledKey,
  getQuadrantCache,
  setQuadrantCache,
  getBuildingPartsBatchCache,
  setBuildingPartsBatchCache,
  getAssembledBuildingsCache,
  setAssembledBuildingsCache,
  clearOsmBuildingsStorage,
} from './osmBuildingsStorage';
import { OverpassResponse } from './osmBuildingsClient';
import { BuildingLoop } from '../../../../types/geometry';
import { WfsBbox } from '../city/wfsWarsawClient';

describe('osmBuildingsStorage', () => {
  beforeEach(async () => {
    await clearOsmBuildingsStorage();
  });

  describe('key formatting', () => {
    it('formats quadrant key consistently', () => {
      const bbox: WfsBbox = [16.92078, 52.40370, 16.92961, 52.40909];
      expect(formatQuadrantKey(bbox)).toBe('16.92078,52.40370,16.92961,52.40909');
    });

    it('formats parts batch key sorted to ensure identical key for identical sets', () => {
      const key1 = formatPartsBatchKey([30, 10, 20], [2, 1]);
      const key2 = formatPartsBatchKey([10, 20, 30], [1, 2]);
      expect(key1).toBe('w:[10,20,30]_r:[1,2]');
      expect(key1).toBe(key2);
    });

    it('formats assembled key with lat, lon, radius, crs', () => {
      expect(formatAssembledKey(52.4064, 16.9252, 300, 'EPSG:2180')).toBe('52.40640_16.92520_r300_EPSG:2180');
    });
  });

  describe('quadrants caching', () => {
    it('saves and retrieves quadrant response', async () => {
      const bbox: WfsBbox = [16.92, 52.40, 16.93, 52.41];
      const mockResp: OverpassResponse = {
        elements: [{ type: 'node', id: 101, lat: 52.405, lon: 16.925 }],
      };

      expect(await getQuadrantCache(bbox)).toBeNull();
      await setQuadrantCache(bbox, mockResp);
      const cached = await getQuadrantCache(bbox);
      expect(cached).toEqual(mockResp);
    });

    it('respects TTL expiration for quadrants', async () => {
      const bbox: WfsBbox = [16.92, 52.40, 16.93, 52.41];
      const mockResp: OverpassResponse = { elements: [] };
      await setQuadrantCache(bbox, mockResp);

      const expired = await getQuadrantCache(bbox, -1);
      expect(expired).toBeNull();
    });
  });

  describe('building parts batch caching', () => {
    it('saves and retrieves building parts batch', async () => {
      const ways = [100, 200];
      const rels = [50];
      const mockResp: OverpassResponse = {
        elements: [{ type: 'way', id: 300, nodes: [1, 2, 1], tags: { 'building:part': 'yes' } }],
      };

      expect(await getBuildingPartsBatchCache(ways, rels)).toBeNull();
      await setBuildingPartsBatchCache(ways, rels, mockResp);
      const cached = await getBuildingPartsBatchCache(ways, rels);
      expect(cached).toEqual(mockResp);
    });
  });

  describe('assembled buildings caching', () => {
    it('saves and retrieves assembled buildings', async () => {
      const mockBuildings: BuildingLoop[] = [
        {
          id: 'osm-1',
          name: 'Budynek 1',
          category: 'building',
          layer: 'WFS_BUDYNKI',
          isTested: false,
          isIncluded: true,
          isLocked: true,
          isCityCentre: false,
          defaultHeight: 15,
          firstFloorHeight: 3.5,
          typicalFloorHeight: 3,
          storeysCount: 5,
          vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
          segments: [],
          buildingType: 'residential',
          hWindowBottom: 0.85,
          isClockwise: false,
          transform: { tx: 0, ty: 0, rotationDeg: 0 },
        },
      ];

      const cachedBefore = await getAssembledBuildingsCache(52.4064, 16.9252, 300, 'EPSG:2180');
      expect(cachedBefore).toBeNull();

      await setAssembledBuildingsCache(52.4064, 16.9252, 300, 'EPSG:2180', mockBuildings);
      const cachedAfter = await getAssembledBuildingsCache(52.4064, 16.9252, 300, 'EPSG:2180');
      expect(cachedAfter).toEqual(mockBuildings);
    });
  });
});
