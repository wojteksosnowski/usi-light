import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as wfsGmlUtils from '../shared/wfsGmlUtils';
import { fetchWarsawBuildings, fetchWarsawParcels } from './wfsWarsawClient';
import { fetchEgibBuildings, fetchEgibParcels } from '../national/wfsEgibClient';
import { fetchPoznanParcels } from './wfsPoznanClient';
import { fetchKrakowBuildings } from './wfsKrakowClient';
import { fetchPoznanMpzp } from '../reference/wfsMpzpPoznanClient';
import { fetchKrakowMpzp } from '../reference/wfsMpzpKrakowClient';
import { fetchGdyniaMpzp } from '../reference/wfsMpzpGdyniaClient';

describe('WFS PropertyName / Attribute Filtering in GetFeature requests', () => {
  let capturedUrls: string[] = [];

  beforeEach(() => {
    capturedUrls = [];
    vi.restoreAllMocks();

    vi.spyOn(wfsGmlUtils, 'parseWfsPolygonGml').mockReturnValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[21.0, 52.2], [21.01, 52.2], [21.01, 52.21], [21.0, 52.2]]] },
          properties: { ID_BUDYNKU: '146501_1.0001.1_BUD', KONDYGNACJE_NADZIEMNE: 5 },
        },
      ],
      memberCount: 1,
    });

    vi.spyOn(wfsGmlUtils, 'parseWfsLineStringGml').mockReturnValue({
      type: 'FeatureCollection',
      features: [],
      memberCount: 0,
    });
  });

  it('fetchWarsawBuildings defines propertyName with GEOMETRY and essential building fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      capturedUrls.push(String(input));
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 });
    });

    await fetchWarsawBuildings([21.0, 52.2, 21.01, 52.21]);
    expect(capturedUrls.length).toBe(1);
    const url = new URL(capturedUrls[0]);
    const propertyName = url.searchParams.get('propertyName');
    expect(propertyName).toBe('GEOMETRY,ID_BUDYNKU,RODZAJ,KONDYGNACJE_NADZIEMNE,KONDYGNACJE_PODZIEMNE');
  });

  it('fetchWarsawParcels defines propertyName with GEOMETRY and parcel fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      capturedUrls.push(String(input));
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 });
    });

    await fetchWarsawParcels([21.0, 52.2, 21.01, 52.21]);
    expect(capturedUrls.length).toBe(1);
    const url = new URL(capturedUrls[0]);
    const propertyName = url.searchParams.get('propertyName');
    expect(propertyName).toBe('GEOMETRY,ID_DZIALKI,NUMER_DZIALKI,NUMER_OBREBU,NAZWA_OBREBU,NAZWA_GMINY,POLE_EWIDENCYJNE,DATA');
  });

  it('fetchEgibBuildings defines propertyName with geom and building attributes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      capturedUrls.push(String(input));
      return new Response('<wfs:FeatureCollection></wfs:FeatureCollection>', { status: 200 });
    });

    const result = await fetchEgibBuildings([21.0, 52.2, 21.01, 52.21]);
    expect(capturedUrls.length).toBe(1);
    const url = new URL(capturedUrls[0], 'http://localhost');
    const propertyName = url.searchParams.get('propertyName');
    expect(propertyName).toBe('geom,ID_BUDYNKU,RODZAJ,KONDYGNACJE_NADZIEMNE');
    expect(result.features.length).toBe(1);
    expect(result.features[0].properties?.ID_BUDYNKU).toBe('146501_1.0001.1_BUD');
    expect(result.features[0].properties?.KONDYGNACJE_NADZIEMNE).toBe(5);
  });

  it('fetchEgibParcels defines propertyName with geom and parcel attributes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      capturedUrls.push(String(input));
      return new Response('<wfs:FeatureCollection></wfs:FeatureCollection>', { status: 200 });
    });

    const result = await fetchEgibParcels([21.0, 52.2, 21.01, 52.21]);
    expect(capturedUrls.length).toBe(1);
    const url = new URL(capturedUrls[0], 'http://localhost');
    const propertyName = url.searchParams.get('propertyName');
    expect(propertyName).toBe('geom,ID_DZIALKI,NUMER_DZIALKI,NUMER_OBREBU,NAZWA_OBREBU,NAZWA_GMINY,DATA');
    expect(result.features.length).toBe(1);
  });

  it('fetchPoznanParcels passes propertyName with gmgml:SHAPE and attributes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      capturedUrls.push(String(input));
      return new Response('<wfs:FeatureCollection></wfs:FeatureCollection>', { status: 200 });
    });

    await fetchPoznanParcels([16.92, 52.4, 16.93, 52.41]);
    expect(capturedUrls.length).toBe(1);
    const url = new URL(capturedUrls[0], 'http://localhost');
    const propertyName = url.searchParams.get('propertyName');
    expect(propertyName).toBe('gmgml:SHAPE,gmgml:IDENTYFIKATOR_DZIAŁKI,gmgml:NUMER_DZIAŁKI,gmgml:NUMER_ARKUSZ,gmgml:POWIERZCHNIA_GEODEZYJNA,gmgml:OZN_DZ');
  });

  it('fetchKrakowBuildings sends valid request without PROPERTYNAME due to MapServer incompatibility', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      capturedUrls.push(String(input));
      return new Response('<wfs:FeatureCollection></wfs:FeatureCollection>', { status: 200 });
    });

    await fetchKrakowBuildings([19.93, 50.05, 19.94, 50.06]);
    expect(capturedUrls.length).toBe(1);
    const url = new URL(capturedUrls[0], 'http://localhost');
    expect(url.searchParams.get('TYPENAME')).toBe('ms:budynki');
    expect(url.searchParams.get('PROPERTYNAME')).toBeNull();
  });

  it('fetchPoznanMpzp, fetchKrakowMpzp, fetchGdyniaMpzp pass PROPERTYNAME with SHAPE and layer attributes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      capturedUrls.push(String(input));
      return new Response('<wfs:FeatureCollection></wfs:FeatureCollection>', { status: 200 });
    });

    await fetchPoznanMpzp([16.92, 52.4, 16.93, 52.41]);
    expect(capturedUrls.length).toBe(2);
    const urlPoznanZones = new URL(capturedUrls[0], 'http://localhost');
    expect(urlPoznanZones.searchParams.get('PROPERTYNAME')).toContain('SHAPE,symbol,symb_t');

    capturedUrls = [];
    await fetchKrakowMpzp([19.93, 50.05, 19.94, 50.06]);
    expect(capturedUrls.length).toBe(1);
    const urlKrakow = new URL(capturedUrls[0], 'http://localhost');
    expect(urlKrakow.searchParams.get('PROPERTYNAME')).toContain('SHAPE,oznaczenie,opis_oznaczenia');

    capturedUrls = [];
    await fetchGdyniaMpzp([18.53, 54.51, 18.54, 54.52]);
    expect(capturedUrls.length).toBe(1);
    const urlGdynia = new URL(capturedUrls[0], 'http://localhost');
    expect(urlGdynia.searchParams.get('PROPERTYNAME')).toBe('SHAPE,tytul,nazwaWlasna,status,obowiazujeOd,przestrzenNazw,lokalnyId');
  });
});
