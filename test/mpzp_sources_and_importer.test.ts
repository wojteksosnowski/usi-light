import { describe, it, expect } from 'vitest';
import { findMpzpSource, MPZP_SOURCES } from '../src/modules/wfs-import/services/mpzpSources';
import { importMpzpZonesFromGeoJson, importMpzpLinesFromGeoJson } from '../src/modules/wfs-import/services/geoJsonImporter';
import { EPSG_2178, EPSG_2177 } from '../src/modules/wfs-import/services/wfsWarsawClient';
import { MpzpZoneRawFeature, MpzpLineRawFeature } from '../src/modules/wfs-import/services/wfsMpzpWarsawClient';

describe('mpzpSources & geoJsonImporter MPZP', () => {
  it('rozpoznaje źródła MPZP dla różnych miast po współrzędnych', () => {
    // Warszawa
    const warsaw = findMpzpSource(52.23, 21.01);
    expect(warsaw?.name).toBe('Warszawa');
    expect(warsaw?.sourceCrs.crs).toBe('EPSG:2178');

    // Kraków
    const krakow = findMpzpSource(50.06, 19.94);
    expect(krakow?.name).toBe('Kraków');
    expect(krakow?.sourceCrs.crs).toBe('EPSG:2178');

    // Wrocław
    const wroclaw = findMpzpSource(51.10, 17.03);
    expect(wroclaw?.name).toBe('Wrocław');
    expect(wroclaw?.sourceCrs.crs).toBe('EPSG:2177');

    // Poznań
    const poznan = findMpzpSource(52.40, 16.92);
    expect(poznan?.name).toBe('Poznań');
    expect(poznan?.sourceCrs.crs).toBe('EPSG:2177');

    // Gdynia
    const gdynia = findMpzpSource(54.52, 18.53);
    expect(gdynia?.name).toBe('Gdynia');
    expect(gdynia?.sourceCrs.crs).toBe('EPSG:2177');

    // Poza zdefiniowanymi miastami
    const unknown = findMpzpSource(53.13, 23.16); // Białystok
    expect(unknown).toBeNull();
  });

  it('importuje strefy MPZP z elastycznym mapowaniem atrybutów urbanistycznych', () => {
    const rawZones: MpzpZoneRawFeature[] = [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [21.0, 52.2],
              [21.01, 52.2],
              [21.01, 52.21],
              [21.0, 52.21],
              [21.0, 52.2],
            ],
          ],
        },
        properties: {
          objectid: 'zone-123',
          SYMBOL: '2.MN/U',
          OPIS: 'Teren zabudowy mieszkaniowo-usługowej',
          MAX_WYSOKOSC: '15.0',
          INTENSYWNOSC: '1.2',
          POW_BIOLOGICZNA: '30%',
          NAZWA_PLANU: 'MPZP Centrum',
        },
      },
      // Obiekt z atrybutami standardu APP (Poznań / Gdynia)
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [16.92, 52.40],
              [16.93, 52.40],
              [16.93, 52.41],
              [16.92, 52.41],
              [16.92, 52.40],
            ],
          ],
        },
        properties: {
          lokalnyId: 'MPZP.103.1118',
          symbol: '2U',
          przeznaczenie_nazwa: 'Teren zabudowy usługowej',
          nazwaWlasna: 'Plan rejonu ul. Roosevelta',
        },
      },
    ];

    const projectCrs = EPSG_2178;
    const projectCenter = { lat: 52.2, lon: 21.0 };

    const imported = importMpzpZonesFromGeoJson(rawZones, projectCrs, projectCenter);
    expect(imported).toHaveLength(2);
    expect(imported[0].id).toBe('zone-123');
    expect(imported[0].funSymb).toBe('2.MN/U');
    expect(imported[0].funNazwa).toBe('Teren zabudowy mieszkaniowo-usługowej');
    expect(imported[0].maxWysokosc).toBe('15.0');
    expect(imported[0].intenZab).toBe('1.2');
    expect(imported[0].powBio).toBe('30%');
    expect(imported[0].nazwaPlan).toBe('MPZP Centrum');
    expect(imported[0].rings).toHaveLength(1);
    expect(imported[0].rings[0].length).toBe(5);

    expect(imported[1].id).toBe('MPZP.103.1118');
    expect(imported[1].funSymb).toBe('2U');
    expect(imported[1].funNazwa).toBe('Teren zabudowy usługowej');
    expect(imported[1].nazwaPlan).toBe('Plan rejonu ul. Roosevelta');
  });

  it('importuje strefy MPZP ze współrzędnymi źródłowymi w układzie PL-2000 (sourceCrs EPSG:2177)', () => {
    // Współrzędne w EPSG:2177 (Poznań / Wrocław)
    const rawZones: MpzpZoneRawFeature[] = [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [6428613.11, 5806443.43],
              [6428650.00, 5806443.43],
              [6428650.00, 5806480.00],
              [6428613.11, 5806480.00],
              [6428613.11, 5806443.43],
            ],
          ],
        },
        properties: {
          OBJECTID: '999',
          symbol: '1MW',
          przeznaczenie_glowne: 'Zabudowa wielorodzinna',
          nazwa_planu: 'MPZP Centrum Zachód',
        },
      },
    ];

    const projectCrs = EPSG_2177;
    const projectCenter = { lat: 52.406, lon: 16.925 };

    const imported = importMpzpZonesFromGeoJson(rawZones, projectCrs, projectCenter, EPSG_2177);
    expect(imported).toHaveLength(1);
    expect(imported[0].id).toBe('999');
    expect(imported[0].funSymb).toBe('1MW');
    expect(imported[0].funNazwa).toBe('Zabudowa wielorodzinna');
    expect(imported[0].nazwaPlan).toBe('MPZP Centrum Zachód');
    expect(imported[0].rings[0][0].x).toBeDefined();
    expect(imported[0].rings[0][0].y).toBeDefined();
    // Współrzędne CAD nie powinny być NaN lub kosmicznie wielkie
    expect(Number.isFinite(imported[0].rings[0][0].x)).toBe(true);
    expect(Number.isFinite(imported[0].rings[0][0].y)).toBe(true);
  });

  it('importuje obiekty liniowe MPZP (linie zabudowy i rozgraniczające)', () => {
    const rawLines: MpzpLineRawFeature[] = [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [21.0, 52.2],
            [21.01, 52.2],
          ],
        },
        properties: {
          TYP_LINII: 'nieprzekraczalna linia zabudowy',
          OPIS: 'Linia 6m od krawędzi jezdni',
        },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [21.0, 52.21],
            [21.01, 52.21],
          ],
        },
        properties: {
          RODZAJ: 'obowiązująca linia zabudowy',
        },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [21.0, 52.22],
            [21.01, 52.22],
          ],
        },
        properties: {
          OPIS: 'Linia rozgraniczająca tereny MN i KD',
        },
      },
      // Linia z atrybutem rodzajLinii (standard APP)
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [6415772.08, 5816179.00],
            [6415781.77, 5816193.84],
          ],
        },
        properties: {
          rodzajLinii: 'nieprzekraczalna linia zabudowy',
        },
      },
    ];

    const projectCrs = EPSG_2177;
    const projectCenter = { lat: 52.406, lon: 16.925 };

    const imported = importMpzpLinesFromGeoJson(rawLines, projectCrs, projectCenter, EPSG_2177);
    expect(imported).toHaveLength(4);
    expect(imported[0].lineType).toBe('nieprzekraczalna_linia_zabudowy');
    expect(imported[0].label).toBe('Linia 6m od krawędzi jezdni');
    expect(imported[1].lineType).toBe('obowiazujaca_linia_zabudowy');
    expect(imported[2].lineType).toBe('linia_rozgraniczajaca');
    expect(imported[3].lineType).toBe('nieprzekraczalna_linia_zabudowy');
  });
});
