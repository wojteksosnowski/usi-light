import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fetchOsmBuildings } from './osmBuildingsClient';
import { latLonToBbox } from '../shared/geocoding';
import type { WfsBbox } from '../city/wfsWarsawClient';
import type { CrsDetectionResult } from '../../../../utils/geoTransform';
import osmOverpassProxyHandler from '../../../../../api/osm-overpass';

/**
 * TESTY LIVE — bez mocków, prawdziwe zapytania Overpass QL do mirrorów Overpass API
 * (przez serverless proxy `/api/osm-overpass`, ten sam kod co w przeglądarce — zob.
 * `api/osm-overpass.ts`). Weryfikuje import budynków OSM na małych wycinkach centrów
 * pięciu miast, żeby regresje w parsowaniu odpowiedzi Overpass (assemblacja multipolygon,
 * winding, dziury) łapać niezależnie od testów jednostkowych z mockowanym fetch()
 * (`osmBuildingsClient.test.ts`).
 *
 * Domyślnie POMIJANE w `npm test` — uruchom jawnie przez `npm run test:live`
 * (RUN_LIVE_WFS_TESTS=1), tak jak pozostałe testy live w tym module.
 */

const LIVE = process.env.RUN_LIVE_WFS_TESTS === '1';

/**
 * `fetchOsmBuildings` woła relatywny URL `/api/osm-overpass` (celowo, dla przeglądarki) —
 * Node `fetch()` w środowisku testowym nie potrafi go rozwiązać bez hosta. Podmieniamy
 * globalny `fetch` tak, żeby zapytania pod ten jeden ścisły URL wołały prawdziwy handler
 * `api/osm-overpass.ts` w procesie (z prawdziwym `fetch()` do mirrorów Overpass w środku) —
 * to nie jest mock sieci, tylko ominięcie warstwy HTTP dla kodu, który i tak działa lokalnie
 * w tym samym procesie Vercela na produkcji.
 */
let originalFetch: typeof fetch;

beforeAll(() => {
  originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.startsWith('/api/osm-overpass')) {
      return originalFetch(input, init);
    }
    let capturedStatus = 200;
    let capturedBody = '';
    const res = {
      setHeader: () => res,
      status(code: number) {
        capturedStatus = code;
        return res;
      },
      send(body: string) {
        capturedBody = body;
        return res;
      },
      json(body: unknown) {
        capturedBody = JSON.stringify(body);
        return res;
      },
      end() {
        return res;
      },
    };
    // @ts-expect-error - fake minimalny VercelRequest/Response, wystarczający dla handlera
    await osmOverpassProxyHandler({ method: 'POST', body: init?.body }, res);
    return new Response(capturedBody, { status: capturedStatus });
  }) as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

const localCrs: CrsDetectionResult = {
  crs: 'LOCAL',
  description: 'lokalny (test)',
  geodeticLabel: 'lokalny',
  isGeodetic: false,
  isLocalReference: true,
};

describe.skipIf(!LIVE)('testy live OSM/Overpass (budynki) — prawdziwy serwer, bez mocków (npm run test:live)', () => {
  // Małe wycinki (~300m x 200m) wokół gęsto zabudowanych centrów pięciu miast — na tyle
  // małe, żeby zapytanie było szybkie, na tyle duże, żeby zawierały realne budynki OSM.
  const cities: Array<{ name: string; bbox: WfsBbox; center: { lat: number; lon: number } }> = [
    { name: 'Warszawa', bbox: [21.005, 52.225, 21.015, 52.232], center: { lat: 52.2285, lon: 21.01 } },
    { name: 'Wrocław', bbox: [17.035, 51.106, 17.042, 51.11], center: { lat: 51.108, lon: 17.0385 } },
    { name: 'Poznań', bbox: [16.9237, 52.4055, 16.9267, 52.4073], center: { lat: 52.4064, lon: 16.9252 } },
    { name: 'Gdańsk', bbox: [18.6435, 54.3495, 18.6495, 54.3535], center: { lat: 54.3515, lon: 18.6465 } },
    { name: 'Kraków', bbox: [19.937, 50.0575, 19.941, 50.0605], center: { lat: 50.059, lon: 19.939 } },
  ];

  for (const city of cities) {
    it(`${city.name}: fetchOsmBuildings zwraca >0 poprawnych budynków dla centrum`, async () => {
      const buildings = await fetchOsmBuildings(city.bbox, city.center, localCrs);
      expect(buildings.length).toBeGreaterThan(0);
      for (const b of buildings) {
        expect(b.vertices.length).toBeGreaterThanOrEqual(3);
        expect(b.segments.length).toBeGreaterThanOrEqual(3);
      }
    }, 65000);
  }

  // Regresja dla zgłoszenia: import przy 500m całkowicie się nie udawał, przy 300m dawał
  // niekompletny wynik, a po "poprawce" osm-error2.json zwrócił dokładnie te same 53 budynki
  // co osm-error1.json (dowód, że fetch nigdy się nie zmienił — patrz remark-detection w
  // osmBuildingsClient.ts). Odtwarzamy dokładny bbox produkcyjny przez `latLonToBbox`,
  // sprawdzamy monotoniczność (więcej budynków przy większym promieniu) i nietrywialny próg —
  // same testy "> 0" przechodziły nawet dla ucinanych przez Overpass odpowiedzi.
  const bugReportCenter = { lat: 52.2545839, lon: 20.996694 };
  it('lokalizacja z bug reportu: liczba budynków rośnie (lub nie maleje) wraz z promieniem 300m -> 500m', async () => {
    const bbox300 = latLonToBbox(bugReportCenter.lat, bugReportCenter.lon, 300) as WfsBbox;
    const bbox500 = latLonToBbox(bugReportCenter.lat, bugReportCenter.lon, 500) as WfsBbox;

    const buildings300 = await fetchOsmBuildings(bbox300, bugReportCenter, localCrs, 300);
    const buildings500 = await fetchOsmBuildings(bbox500, bugReportCenter, localCrs, 500);

    expect(buildings500.length).toBeGreaterThanOrEqual(buildings300.length);
    // Gęsto zabudowana część Warszawy (Bonifraterska/Muranów) — próg dobrany z realnego
    // eksportu referencyjnego (reference/osm-error1.json miał 53 budynki przy tym obszarze).
    expect(buildings500.length).toBeGreaterThanOrEqual(20);
  }, 90000);
});
