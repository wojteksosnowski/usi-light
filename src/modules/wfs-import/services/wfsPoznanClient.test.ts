import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPoznanBuildings, fetchPoznanParcels } from './wfsPoznanClient';
import { wgs84BboxToEpsg2177, wgs84BboxToEpsg2177EN } from './wfsWarsawClient';

const EMPTY_FEATURE_COLLECTION_GML = `<?xml version="1.0"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gmgml="http://www.geomedia.com/gml"></wfs:FeatureCollection>`;

describe('wfsPoznanClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(EMPTY_FEATURE_COLLECTION_GML),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const bbox: [number, number, number, number] = [16.92, 52.40, 16.93, 52.41];

  it('fetchPoznanBuildings rzuca błąd natychmiast, bez wysyłania zapytania sieciowego (filtr BBOX warstwy Budynki_ewidencyjne jest zepsuty po stronie serwera Poznania — potwierdzone bezpośrednim testem na żywym serwerze)', async () => {
    await expect(fetchPoznanBuildings(bbox)).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('wysyła BBOX dla działek w kolejności northing,easting (EPSG:2177), zgodnej z realnymi zapytaniami serwera Poznania w HAR', async () => {
    await fetchPoznanParcels(bbox).catch(() => {});

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const bboxParam = new URL(calledUrl, 'http://localhost').searchParams.get('BBOX');

    expect(bboxParam).toBe(wgs84BboxToEpsg2177(bbox));
    // Kontrola negatywna: NIE może to być kolejność easting,northing (dawny błąd zerowych wyników)
    expect(bboxParam).not.toBe(wgs84BboxToEpsg2177EN(bbox));
  });
});
