import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchOsmBuildings, OVERPASS_ENDPOINTS } from '../src/modules/wfs-import/services/osmBuildingsClient';
import { fetchOsmLanduse } from '../src/modules/wfs-import/services/osmLanduseClient';
import { EPSG_2180 } from '../src/modules/wfs-import/services/wfsEgibClient';

describe('OSM Clients Failover & Timeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchOsmBuildings powinien przejść do kolejnego endpointu jeśli pierwszy zwróci 406 lub błąd sieci', async () => {
    const mockOsmResponse = {
      elements: [
        {
          type: 'way',
          id: 12345,
          nodes: [1, 2, 3, 1],
          tags: { building: 'yes', 'building:levels': '3' },
        },
        { type: 'node', id: 1, lat: 52.22, lon: 21.00 },
        { type: 'node', id: 2, lat: 52.221, lon: 21.00 },
        { type: 'node', id: 3, lat: 52.221, lon: 21.001 },
      ],
    };

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url) => {
      callCount++;
      if (callCount === 1) {
        // Pierwszy endpoint zawodzi (np. 406 Not Acceptable)
        return Promise.resolve(new Response('Not Acceptable', { status: 406 }));
      }
      // Drugi endpoint zwraca poprawne dane JSON
      return Promise.resolve(new Response(JSON.stringify(mockOsmResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    const buildings = await fetchOsmBuildings(
      [21.00, 52.22, 21.01, 52.23],
      { lat: 52.22, lon: 21.00 },
      EPSG_2180,
      200
    );

    expect(callCount).toBe(2);
    expect(buildings.length).toBeGreaterThan(0);
    expect(buildings[0].id).toBe('osm-bld-12345');
    expect(buildings[0].storeysCount).toBe(3);
  });

  it('fetchOsmLanduse powinien obsłużyć failover i zwrócić sparsowane obiekty', async () => {
    const mockLanduseResponse = {
      elements: [
        {
          type: 'node',
          id: 999,
          lat: 52.22001,
          lon: 21.00001,
          tags: { natural: 'tree', genus: 'Quercus', height: '12' },
        },
      ],
    };

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Network timeout'));
      }
      return Promise.resolve(new Response(JSON.stringify(mockLanduseResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    const localCrs = { crs: 'LOCAL' as const, description: 'Local', geodeticLabel: 'Local', isGeodetic: false, isLocalReference: true };
    const result = await fetchOsmLanduse(
      [21.00, 52.22, 21.01, 52.23],
      { lat: 52.22, lon: 21.00 },
      localCrs,
      200
    );

    expect(callCount).toBe(2);
    expect(result.trees.length).toBe(1);
    expect(result.trees[0].genus).toBe('Quercus');
  });

  it('powinien rzucić zrozumiały błąd, gdy wszystkie endpointy zawiodą, zamiast zawieszać proces', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response('Forbidden', { status: 403 }));
    });

    await expect(
      fetchOsmBuildings([21.00, 52.22, 21.01, 52.23], { lat: 52.22, lon: 21.00 }, EPSG_2180, 200)
    ).rejects.toThrow(/Nie udało się pobrać budynków z OpenStreetMap/);
  });
});
