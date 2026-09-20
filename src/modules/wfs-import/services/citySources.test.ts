import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./wfsWarsawClient', async () => {
  const actual = await vi.importActual<typeof import('./wfsWarsawClient')>('./wfsWarsawClient');
  return { ...actual, fetchWarsawBuildings: vi.fn() };
});
vi.mock('./wfsKrakowClient', () => ({
  fetchKrakowBuildings: vi.fn(),
  fetchKrakowParcels: vi.fn(),
}));
vi.mock('./wfsPoznanClient', () => ({
  fetchPoznanBuildings: vi.fn(),
  fetchPoznanParcels: vi.fn(),
}));
vi.mock('./wfsEgibClient', async () => {
  const actual = await vi.importActual<typeof import('./wfsEgibClient')>('./wfsEgibClient');
  return { ...actual, fetchEgibBuildings: vi.fn() };
});

import { CITY_SOURCES, findCitySource, fetchBuildingsWithFallback } from './citySources';

const NATIONAL_EGIB = CITY_SOURCES[CITY_SOURCES.length - 1];

describe('findCitySource - izolacja miast', () => {
  it('zwraca Warszawę dla współrzędnych w jej bboxie', () => {
    expect(findCitySource(52.23, 21.0)?.name).toBe('Warszawa');
  });

  it('zwraca Kraków dla współrzędnych w jego bboxie', () => {
    expect(findCitySource(50.06, 19.94)?.name).toBe('Kraków');
  });

  it('zwraca Poznań dla współrzędnych w jego bboxie', () => {
    expect(findCitySource(52.4064, 16.9252)?.name).toBe('Poznań');
  });

  it('zwraca krajowy fallback EGiB dla miasta bez dedykowanego wpisu (Wrocław)', () => {
    const source = findCitySource(51.1079, 17.0385);
    expect(source).toBe(NATIONAL_EGIB);
  });

  it('zwraca krajowy fallback EGiB dla miasta bez dedykowanego wpisu (Gdańsk)', () => {
    const source = findCitySource(54.352, 18.6466);
    expect(source).toBe(NATIONAL_EGIB);
  });

  it('dodanie nowego miasta do CITY_SOURCES nie zmienia wyniku dla współrzędnych spoza jego bboxa', () => {
    // Właściwość ogólna: każdy wpis dopasowuje się tylko we własnym bboxie — punkt Wrocławia
    // leży poza bboxami Warszawy/Krakowa/Poznania, więc niezależnie od tego, ile miast jest
    // w tablicy, powinien zawsze trafiać w ten sam (ostatni) wpis krajowy.
    for (const city of CITY_SOURCES.slice(0, -1)) {
      const [west, south, east, north] = city.bbox;
      const wroclawLon = 17.0385;
      const wroclawLat = 51.1079;
      const insideThisCity = wroclawLon >= west && wroclawLon <= east && wroclawLat >= south && wroclawLat <= north;
      expect(insideThisCity).toBe(false);
    }
    expect(findCitySource(51.1079, 17.0385)).toBe(NATIONAL_EGIB);
  });
});

describe('fetchBuildingsWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('zwraca null, gdy citySource jest null', async () => {
    const result = await fetchBuildingsWithFallback(null, [0, 0, 1, 1]);
    expect(result).toBeNull();
  });

  it('zwraca wynik z citySource, gdy fetch się powiedzie', async () => {
    const geojson = { type: 'FeatureCollection' as const, features: [] };
    const krakow = CITY_SOURCES.find((c) => c.name === 'Kraków')!;
    (krakow.fetchBuildings as ReturnType<typeof vi.fn>).mockResolvedValue(geojson);

    const result = await fetchBuildingsWithFallback(krakow, [0, 0, 1, 1]);
    expect(result?.source).toBe(krakow);
    expect(result?.geojson).toBe(geojson);
  });

  it('spada na krajowy fallback EGiB, gdy fetch miejskiego źródła rzuci błędem', async () => {
    const geojson = { type: 'FeatureCollection' as const, features: [] };
    const krakow = CITY_SOURCES.find((c) => c.name === 'Kraków')!;
    (krakow.fetchBuildings as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('WFS 500'));
    (NATIONAL_EGIB.fetchBuildings as ReturnType<typeof vi.fn>).mockResolvedValue(geojson);

    const result = await fetchBuildingsWithFallback(krakow, [0, 0, 1, 1]);
    expect(result?.source).toBe(NATIONAL_EGIB);
    expect(result?.geojson).toBe(geojson);
  });

  it('propaguje błąd bez pętli, gdy nawet krajowy fallback zawiedzie', async () => {
    const krakow = CITY_SOURCES.find((c) => c.name === 'Kraków')!;
    (krakow.fetchBuildings as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('WFS 500'));
    (NATIONAL_EGIB.fetchBuildings as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('EGiB też padł'));

    await expect(fetchBuildingsWithFallback(krakow, [0, 0, 1, 1])).rejects.toThrow('EGiB też padł');
  });

  it('dla Poznania zawsze spada na krajowy fallback EGiB (miejski serwis budynków ma zepsuty filtr BBOX — celowo zawsze rzuca)', async () => {
    const geojson = { type: 'FeatureCollection' as const, features: [] };
    const poznan = CITY_SOURCES.find((c) => c.name === 'Poznań')!;
    (poznan.fetchBuildings as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('BBOX filter broken'));
    (NATIONAL_EGIB.fetchBuildings as ReturnType<typeof vi.fn>).mockResolvedValue(geojson);

    const result = await fetchBuildingsWithFallback(poznan, [0, 0, 1, 1]);
    expect(result?.source).toBe(NATIONAL_EGIB);
    expect(result?.geojson).toBe(geojson);
    expect(NATIONAL_EGIB.fetchBuildings).toHaveBeenCalledTimes(1);
  });

  it('nie próbuje fallbacku drugi raz, gdy citySource to już krajowy EGiB', async () => {
    (NATIONAL_EGIB.fetchBuildings as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('EGiB padł'));

    await expect(fetchBuildingsWithFallback(NATIONAL_EGIB, [0, 0, 1, 1])).rejects.toThrow('EGiB padł');
    expect(NATIONAL_EGIB.fetchBuildings).toHaveBeenCalledTimes(1);
  });
});
