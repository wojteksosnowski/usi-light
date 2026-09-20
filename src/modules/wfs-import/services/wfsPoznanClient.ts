/**
 * Klient WFS dla poznańskiego serwisu EGiB (Intergraph/GeoMedia WFS 2.0.0):
 * https://sipuslugiogc1.geopoz.poznan.pl/WFS_SIP_EWIDENCJA/service.svc/get
 *
 * Serwer nie wysyła nagłówków CORS, więc zapytania idą przez `/api/wfs?target=poznan-egib`
 * (api/wfs.ts), tak jak dla Krakowa/EGiB krajowego.
 *
 * Kolejność osi w BBOX to (northing, easting) — potwierdzone na podstawie realnych zapytań
 * `GetMap` z `CRS=EPSG:2177` do tego samego serwera w dumpie HAR
 * (reference/sipmapy.geopoz.poznan.pl.har), oraz empirycznie: działki (`Działki_ewidencyjne`)
 * z tą kolejnością osi działają bezbłędnie (potwierdzone przez użytkownika w aplikacji i
 * bezpośrednim testem `curl` na serwer, np. BBOX ±5000m wokół centrum Poznania zwraca
 * poprawnie 120070 dopasowań).
 *
 * UWAGA — `Budynki_ewidencyjne` jest CELOWO wyłączona (patrz `fetchPoznanBuildings` niżej):
 * bezpośredni test `curl` na serwer (bez naszej apki/proxy) wykazał, że filtr przestrzenny
 * (BBOX) tej konkretnej warstwy jest zepsuty po stronie serwera Poznania — dla realnego
 * promienia projektu (100-300m wokół centrum, EPSG:2177 N≈5808660 E≈6426862) odpowiedzi są
 * niedeterministyczne względem rozmiaru BBOX: 100/200/300m → HTTP 200 z `numberMatched="0"`
 * (fałszywy brak danych), 150m → HTTP 200 zwracające CAŁĄ bazę (89533 rekordów, filtr
 * ewidentnie zignorowany), 500m/1200-1400m/5000m → HTTP 400 `ExceptionReport`
 * ("Zdalne wywołanie procedury nie powiodło się", HRESULT 0x800706BE — awaria RPC serwera).
 * Zapytanie BEZ BBOX działa poprawnie i zwraca realne dane (structure/atrybuty potwierdzone),
 * więc dane istnieją — zepsuty jest tylko indeks/filtr przestrzenny tej warstwy. Ponieważ ten
 * błąd bywa "cichy" (HTTP 200 z pustym wynikiem, bez wyjątku), `fetchBuildingsWithFallback`
 * (`citySources.ts`) nie wykrywał go i nigdy nie przechodził na fallback krajowy — dlatego
 * `fetchPoznanBuildings` rzuca błąd natychmiast, bez wysyłania zapytania, wymuszając
 * niezawodny fallback na krajowy EGiB (`wfsEgibClient.ts`), który dla tego samego obszaru
 * poprawnie zwraca budynki (potwierdzone bezpośrednim testem `curl`).
 */

import { GeoJsonFeatureCollection, WfsBbox, wgs84BboxToEpsg2177 } from './wfsWarsawClient';
import { parseWfsPolygonGml } from './wfsGmlUtils';

const POZNAN_EGIB_WFS_URL = '/api/wfs?target=poznan-egib';

const WFS_REQUEST_TIMEOUT_MS = 10000;

async function fetchPoznanEgibLayer(typeName: string, bbox: WfsBbox): Promise<string> {
  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    typeNames: typeName,
    BBOX: wgs84BboxToEpsg2177(bbox),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WFS_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${POZNAN_EGIB_WFS_URL}&${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`WFS Poznań ${typeName}: ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPoznanBuildings(_bbox: WfsBbox): Promise<GeoJsonFeatureCollection> {
  // Patrz komentarz nagłówkowy pliku: filtr BBOX warstwy Budynki_ewidencyjne jest zepsuty po
  // stronie serwera Poznania (potwierdzone empirycznie) — rzucamy od razu, żeby
  // fetchBuildingsWithFallback niezawodnie przeszedł na krajowy EGiB.
  throw new Error(
    'Serwis WFS budynków Poznania (Budynki_ewidencyjne) ma niestabilny filtr BBOX po stronie serwera (potwierdzone empirycznie) — pomijam, używam fallbacku krajowego EGiB.'
  );
}

export async function fetchPoznanParcels(bbox: WfsBbox): Promise<GeoJsonFeatureCollection> {
  const gml = await fetchPoznanEgibLayer('gmgml:Działki_ewidencyjne', bbox);
  return parseWfsPolygonGml(gml, 'member', 'Działki_ewidencyjne', ['ID_DZIALKI', 'NUMER_DZIALKI']);
}
