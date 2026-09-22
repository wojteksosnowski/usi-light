import { describe, it, expect } from 'vitest';
import { fetchDsmBbox, parseAaigrid } from './wcsGugikClient';
import { wgs84ToEpsg2180 } from './wgs84ToEpsg2180';
import wcsProxyHandler from '../../../../../api/wcs';

/**
 * TESTY LIVE — bez mocków, prawdziwe zapytania GetCoverage do serwisu WCS GUGiK
 * (mapy.geoportal.gov.pl, NMT/NMPT). Regresja dla błędu 400 zgłoszonego dla centrum
 * Wrocławia: obwiednia budynków rozdęta przez odstający obiekt importu wysyłała do WCS
 * zapytanie o zasięg całego kraju (patrz `terrainAnalyzer.ts` — MAX_SINGLE_BUILDING_SPAN_M /
 * MAX_DISTANCE_FROM_REFERENCE_M) — tu weryfikujemy samą warstwę WCS na małych, realnych
 * wycinkach dla kilku miast, żeby regresja przy okazji łapała też awarie samego serwera GUGiK.
 *
 * Domyślnie POMIJANE w `npm test` — uruchom jawnie przez `npm run test:live`
 * (RUN_LIVE_WFS_TESTS=1), tak jak pozostałe testy live w tym module.
 */

const LIVE = process.env.RUN_LIVE_WFS_TESTS === '1';

/** Fake VercelRequest/Response — jak w `city/liveWfsServers.live.test.ts` — pozwala wywołać
 * prawdziwy handler `api/wcs.ts` w procesie (bez warstwy HTTP), zachowując prawdziwy fetch()
 * do serwera GUGiK. */
async function callWcsProxy(query: Record<string, string | string[]>): Promise<{ status: number; body: string }> {
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
  await wcsProxyHandler({ method: 'GET', query }, res);
  return { status: capturedStatus, body: capturedBody };
}

/** `fetchDsmBbox`/`fetchDtmBbox` z `wcsGugikClient.ts` idą przez relatywny URL `/api/wcs`,
 * który (celowo, dla przeglądarki) nie zawiera hosta — Node `fetch()` w środowisku testowym
 * nie potrafi go rozwiązać. Ta pomocnicza funkcja odtwarza dokładnie tę samą logikę
 * (te same parametry `subset`/`subsettingCRS`), ale woła proxy `api/wcs.ts` bezpośrednio
 * w procesie, tak jak `callWfsProxy` w `city/liveWfsServers.live.test.ts` dla WFS. */
async function fetchGridViaProxy(
  target: 'nmt' | 'nmpt',
  coverageId: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
) {
  const result = await callWcsProxy({
    target,
    service: 'WCS',
    version: '2.0.1',
    request: 'GetCoverage',
    CoverageId: coverageId,
    format: 'image/x-aaigrid',
    subsettingCRS: 'http://www.opengis.net/def/crs/EPSG/0/2180',
    subset: [`x(${Math.floor(minX)},${Math.ceil(maxX)})`, `y(${Math.floor(minY)},${Math.ceil(maxY)})`],
  });
  if (result.status !== 200) throw new Error(`WCS ${target}: ${result.status}`);
  return parseAaigrid(result.body);
}

describe.skipIf(!LIVE)('testy live WCS GUGiK (NMT/NMPT) — prawdziwy serwer, bez mocków (npm run test:live)', () => {
  // Punkty centralne pięciu miast, wycinek ~200m x 200m wokół każdego — na tyle mały,
  // że mieści się bez problemu w limicie MAX_WCS_BBOX_SPAN_M z wcsGugikClient.ts.
  const cities: Array<{ name: string; lat: number; lon: number }> = [
    { name: 'Warszawa', lat: 52.2297, lon: 21.0122 },
    { name: 'Wrocław', lat: 51.1079, lon: 17.0385 },
    { name: 'Poznań', lat: 52.4064, lon: 16.9252 },
    { name: 'Gdańsk', lat: 54.352, lon: 18.6466 },
    { name: 'Kraków', lat: 50.0614, lon: 19.9366 },
  ];

  for (const city of cities) {
    it(`${city.name}: NMPT (DSM) zwraca poprawną siatkę dla małego wycinka centrum`, async () => {
      const center = wgs84ToEpsg2180(city.lat, city.lon);
      const grid = await fetchGridViaProxy('nmpt', 'DSM_PL-KRON86-NH', center.x - 100, center.y - 100, center.x + 100, center.y + 100);
      expect(grid.ncols).toBeGreaterThan(0);
      expect(grid.nrows).toBeGreaterThan(0);
      expect(grid.data.length).toBe(grid.ncols * grid.nrows);
    }, 30000);

    it(`${city.name}: NMT (DTM) zwraca poprawną siatkę dla małego wycinka centrum`, async () => {
      const center = wgs84ToEpsg2180(city.lat, city.lon);
      const grid = await fetchGridViaProxy('nmt', 'DTM_PL-KRON86-NH', center.x - 100, center.y - 100, center.x + 100, center.y + 100);
      expect(grid.ncols).toBeGreaterThan(0);
      expect(grid.nrows).toBeGreaterThan(0);
      expect(grid.data.length).toBe(grid.ncols * grid.nrows);
    }, 30000);
  }

  it('odrzuca zbyt dużą obwiednię lokalnie, zanim wyśle zapytanie do WCS (regresja bug 400 dla Wrocławia)', async () => {
    // Dokładnie ten scenariusz co w raporcie użytkownika: obwiednia rzędu setek km.
    await expect(fetchDsmBbox(362678, 361903, 637680, 486966)).rejects.toThrow(/zbyt duża/i);
  });

  it('proxy /api/wcs odrzuca (400) zapytanie GetCoverage z nieprawidłowym CoverageId', async () => {
    // Weryfikacja samego proxy (nie tylko klienta) — nieznany/zły CoverageId musi zostać
    // odrzucony po stronie serwerless proxy, zanim jakiekolwiek żądanie pójdzie do GUGiK.
    const result = await callWcsProxy({
      target: 'nmpt',
      service: 'WCS',
      version: '2.0.1',
      request: 'GetCoverage',
      CoverageId: 'NIEISTNIEJACY_COVERAGE',
      format: 'image/x-aaigrid',
      subsettingCRS: 'http://www.opengis.net/def/crs/EPSG/0/2180',
    });
    expect(result.status).toBe(400);
  }, 30000);
});
