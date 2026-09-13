import { describe, it, expect } from 'vitest';
import { findMpzpSource, MPZP_SOURCES } from '../src/modules/wfs-import/services/mpzpSources';
import { importMpzpZonesFromGeoJson, importMpzpLinesFromGeoJson } from '../src/modules/wfs-import/services/geoJsonImporter';
import { EPSG_2178 } from '../src/modules/wfs-import/services/wfsWarsawClient';
import { MpzpZoneRawFeature, MpzpLineRawFeature } from '../src/modules/wfs-import/services/wfsMpzpWarsawClient';

describe('mpzpSources & geoJsonImporter MPZP', () => {
  it('rozpoznaje źródła MPZP dla różnych miast po współrzędnych', () => {
    // Warszawa
    const warsaw = findMpzpSource(52.23, 21.01);
    expect(warsaw?.name).toBe('Warszawa');

    // Kraków
    const krakow = findMpzpSource(50.06, 19.94);
    expect(krakow?.name).toBe('Kraków');

    // Wrocław
    const wroclaw = findMpzpSource(51.10, 17.03);
    expect(wroclaw?.name).toBe('Wrocław');

    // Poznań
    const poznan = findMpzpSource(52.40, 16.92);
    expect(poznan?.name).toBe('Poznań');

    // Poza zdefiniowanymi miastami
    const unknown = findMpzpSource(54.50, 18.50);
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
    ];

    const projectCrs = EPSG_2178;
    const projectCenter = { lat: 52.2, lon: 21.0 };

    const imported = importMpzpZonesFromGeoJson(rawZones, projectCrs, projectCenter);
    expect(imported).toHaveLength(1);
    expect(imported[0].id).toBe('zone-123');
    expect(imported[0].funSymb).toBe('2.MN/U');
    expect(imported[0].funNazwa).toBe('Teren zabudowy mieszkaniowo-usługowej');
    expect(imported[0].maxWysokosc).toBe('15.0');
    expect(imported[0].intenZab).toBe('1.2');
    expect(imported[0].powBio).toBe('30%');
    expect(imported[0].nazwaPlan).toBe('MPZP Centrum');
    expect(imported[0].rings).toHaveLength(1);
    expect(imported[0].rings[0].length).toBe(5);
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
    ];

    const projectCrs = EPSG_2178;
    const projectCenter = { lat: 52.2, lon: 21.0 };

    const imported = importMpzpLinesFromGeoJson(rawLines, projectCrs, projectCenter);
    expect(imported).toHaveLength(3);
    expect(imported[0].lineType).toBe('nieprzekraczalna_linia_zabudowy');
    expect(imported[0].label).toBe('Linia 6m od krawędzi jezdni');
    expect(imported[1].lineType).toBe('obowiazujaca_linia_zabudowy');
    expect(imported[2].lineType).toBe('linia_rozgraniczajaca');
  });
});
