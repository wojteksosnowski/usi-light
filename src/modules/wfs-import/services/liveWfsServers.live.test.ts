import { describe, it, expect } from 'vitest';
import { fetchWarsawBuildings, fetchWarsawParcels, wgs84BboxToEpsg2178Bounds, wgs84BboxToEpsg2177Bounds, type WfsBbox } from './wfsWarsawClient';
import wfsProxyHandler from '../../../../api/wfs';

/**
 * TESTY LIVE — bez żadnych mocków. Każdy `it` poniżej wykonuje prawdziwe zapytanie sieciowe
 * do prawdziwego, zewnętrznego serwera WFS (albo bezpośrednio, dla serwerów z CORS, albo przez
 * realny, wywołany w procesie handler `api/wfs.ts` — bez owijania fetch mockiem — dla serwerów
 * bez CORS, gdzie klient produkcyjny normalnie idzie przez przeglądarkowy proxy z relatywnym
 * URL-em, którego Node `fetch` nie potrafi rozwiązać).
 *
 * Domyślnie POMIJANE w zwykłym `npm test`/CI (network-dependent, wolne, zależne od
 * dostępności zewnętrznych serwerów rządowych/miejskich) — uruchom jawnie przez:
 *   npm run test:live
 * (ustawia RUN_LIVE_WFS_TESTS=1). Bez tej zmiennej testy pokazują się jako *skipped*, nie
 * *failed* — nie psują normalnego przepływu `npm test`.
 */

const LIVE = process.env.RUN_LIVE_WFS_TESTS === '1';

/** Minimalny fake VercelRequest/Response wystarczający dla handlera w api/wfs.ts — zbiera
 * tylko status/body, samo ciało odpowiedzi pochodzi z PRAWDZIWEGO fetch() wykonanego przez
 * handler do prawdziwego serwera upstream. To nie jest mock sieci — to bezpośrednie wywołanie
 * prawdziwego kodu produkcyjnego w procesie, zamiast przez warstwę HTTP. */
async function callWfsProxy(query: Record<string, string>): Promise<{ status: number; body: string }> {
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
  await wfsProxyHandler({ method: 'GET', query }, res);
  return { status: capturedStatus, body: capturedBody };
}

describe.skipIf(!LIVE)('testy live WFS — prawdziwe serwery, bez mocków (npm run test:live)', () => {
  const warsawBbox: WfsBbox = [21.005, 52.225, 21.015, 52.232]; // Śródmieście
  const krakowBbox: WfsBbox = [19.937, 50.0575, 19.941, 50.0605]; // Stare Miasto
  const wroclawBbox: WfsBbox = [17.035, 51.106, 17.042, 51.11]; // centrum, zgłoszony punkt użytkownika
  const poznanBbox: WfsBbox = [16.9237, 52.4055, 16.9267, 52.4073]; // centrum, zgłoszony punkt użytkownika

  it('Warszawa: fetchWarsawBuildings zwraca >0 budynków dla Śródmieścia', async () => {
    const result = await fetchWarsawBuildings(warsawBbox);
    expect(result.features.length).toBeGreaterThan(0);
  }, 20000);

  it('Warszawa: fetchWarsawParcels zwraca >0 działek dla Śródmieścia', async () => {
    const result = await fetchWarsawParcels(warsawBbox);
    expect(result.features.length).toBeGreaterThan(0);
  }, 20000);

  it('Kraków (przez realny handler api/wfs.ts, target=krakow-wfs): budynki zwracają >0 obiektów', async () => {
    const { minE, minN, maxE, maxN } = wgs84BboxToEpsg2178Bounds(krakowBbox);
    const { status, body } = await callWfsProxy({
      target: 'krakow-wfs',
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: 'ms:budynki',
      // Kraków oczekuje kolejności easting,northing (patrz wfsKrakowClient.ts)
      BBOX: `${minE},${minN},${maxE},${maxN}`,
    });
    expect(status).toBe(200);
    expect(body).toContain('featureMember');
  }, 20000);

  it('Kraków (przez realny handler api/wfs.ts, target=krakow-wfs): działki zwracają >0 obiektów', async () => {
    const { minE, minN, maxE, maxN } = wgs84BboxToEpsg2178Bounds(krakowBbox);
    const { status, body } = await callWfsProxy({
      target: 'krakow-wfs',
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: 'ms:dzialki',
      BBOX: `${minE},${minN},${maxE},${maxN}`,
    });
    expect(status).toBe(200);
    expect(body).toContain('featureMember');
  }, 20000);

  it('krajowy EGiB (przez realny handler api/wfs.ts, target=egib-wfs): budynki dla Wrocławia zwracają >0 obiektów', async () => {
    const [west, south, east, north] = wroclawBbox;
    const { status, body } = await callWfsProxy({
      target: 'egib-wfs',
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'ms:budynki',
      bbox: `${south},${west},${north},${east},urn:ogc:def:crs:EPSG::4326`,
      count: '1000',
      startIndex: '0',
    });
    expect(status).toBe(200);
    expect(body).toMatch(/numberReturned="[1-9]/);
  }, 20000);

  it('krajowy EGiB (przez realny handler api/wfs.ts, target=egib-wfs): budynki dla Poznania zwracają >0 obiektów (potwierdza, że fallback ma czym zastąpić zepsuty serwis miejski)', async () => {
    const [west, south, east, north] = poznanBbox;
    const { status, body } = await callWfsProxy({
      target: 'egib-wfs',
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'ms:budynki',
      bbox: `${south},${west},${north},${east},urn:ogc:def:crs:EPSG::4326`,
      count: '1000',
      startIndex: '0',
    });
    expect(status).toBe(200);
    expect(body).toMatch(/numberReturned="[1-9]/);
  }, 20000);

  it('Poznań: serwis miejski Budynki_ewidencyjne (bezpośrednio na sipuslugiogc1.geopoz.poznan.pl) ma NIEWIARYGODNY filtr BBOX przy realnym promieniu projektu — dokumentacja znanego, potwierdzonego błędu serwera, celowo nieużywanego w produkcji (patrz wfsPoznanClient.ts)', async () => {
    const { minE, minN, maxE, maxN } = wgs84BboxToEpsg2177Bounds(poznanBbox);
    const bboxNE = `${minN},${minE},${maxN},${maxE}`;
    const params = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '2.0.0',
      REQUEST: 'GetFeature',
      typeNames: 'gmgml:Budynki_ewidencyjne',
      BBOX: bboxNE,
      count: '5',
    });
    const res = await fetch(
      `https://sipuslugiogc1.geopoz.poznan.pl/WFS_SIP_EWIDENCJA/service.svc/get?${params}`
    );
    const body = await res.text();
    // Znany błąd serwera: przy tym samym realnym BBOX odpowiedź jest niewiarygodna (HTTP 200
    // z numberMatched="0" mimo istniejących danych, całą bazą zamiast filtrowanego wyniku, albo
    // HTTP 400 z ExceptionReport o awarii RPC) — nigdy stabilnie niepusty, poprawny wynik.
    // Ten test ma czerwienić się (i przypominać o konieczności przywrócenia fetchPoznanBuildings),
    // GDYBY serwer Poznania kiedyś naprawił swój filtr przestrzenny dla tej warstwy.
    const looksReliable = res.status === 200 && /numberMatched="[1-9][0-9]{0,3}"/.test(body);
    expect(looksReliable).toBe(false);
  }, 20000);

  it('Poznań: działki (Działki_ewidencyjne, bezpośrednio na sipuslugiogc1.geopoz.poznan.pl) działają poprawnie z realnym BBOX', async () => {
    const { minE, minN, maxE, maxN } = wgs84BboxToEpsg2177Bounds(poznanBbox);
    const bboxNE = `${minN},${minE},${maxN},${maxE}`;
    const params = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '2.0.0',
      REQUEST: 'GetFeature',
      typeNames: 'gmgml:Działki_ewidencyjne',
      BBOX: bboxNE,
      count: '5',
    });
    const res = await fetch(
      `https://sipuslugiogc1.geopoz.poznan.pl/WFS_SIP_EWIDENCJA/service.svc/get?${params}`
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/numberMatched="[1-9]/);
  }, 20000);
});
