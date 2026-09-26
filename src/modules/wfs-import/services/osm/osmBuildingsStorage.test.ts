import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatQuadrantKey,
  getQuadrantCache,
  setQuadrantCache,
  clearOsmBuildingsStorage,
} from './osmBuildingsStorage';
import { OverpassResponse } from './osmBuildingsClient';
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
});
