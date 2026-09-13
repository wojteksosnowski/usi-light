/**
 * Wspólne narzędzia do parsowania odpowiedzi GML z serwisów WFS EGiB
 * (Kraków — WFS 1.1.0 / `gml:featureMember`, EGiB krajowy — WFS 2.0.0 / `wfs:member`).
 * Oba serwery nie wspierają `outputFormat=application/json`, więc geometrię
 * trzeba parsować ręcznie z GML, tak jak dla drzew warszawskich (parseTreesGml).
 */

import { GeoJsonFeatureCollection } from './wfsWarsawClient';

/** Bezpieczne parsowanie liczby z tekstu atrybutu GML — niektóre atrybuty bywają
 * niedostępne publicznie i wracają jako tekst (np. "brak_uprawnień") zamiast liczby. */
export function numericOrUndefined(text: string): number | undefined {
  const n = Number(text);
  return text !== '' && Number.isFinite(n) ? n : undefined;
}

export interface ParsedGmlResult extends GeoJsonFeatureCollection {
  /** Liczba obiektów w tej stronie odpowiedzi — do wykrywania czy trzeba dociągnąć kolejną stronę (paginacja). */
  memberCount: number;
}

/**
 * Parsuje odpowiedź GML z poligonami na GeoJsonFeatureCollection.
 * `memberTagName` różni się między wersjami WFS: 'featureMember' (WFS 1.1.0, Kraków)
 * vs 'member' (WFS 2.0.0, krajowy EGiB).
 *
 * Uwaga na kolejność osi: `gml:posList` w geometrii odpowiedzi obu serwerów jest
 * w kolejności (northing, easting) — pary są tu odwracane na [easting, northing],
 * zgodnie z tym czego oczekuje geoJsonImporter.ts.
 */
export function parseWfsPolygonGml(
  gml: string,
  memberTagName: string,
  featureTagName: string,
  textProperties: string[],
  numericProperties: string[] = []
): ParsedGmlResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gml, 'text/xml');
  const features: GeoJsonFeatureCollection['features'] = [];

  const memberElements = doc.getElementsByTagNameNS('*', memberTagName);

  for (let i = 0; i < memberElements.length; i++) {
    const member = memberElements[i];
    const featureEl = member.getElementsByTagNameNS('*', featureTagName)[0]
      || member.firstElementChild;
    if (!featureEl) continue;

    const getText = (tagName: string): string => {
      const els = featureEl.getElementsByTagNameNS('*', tagName);
      return els.length > 0 ? (els[0].textContent || '').trim() : '';
    };

    const exteriorEl = featureEl.getElementsByTagNameNS('*', 'exterior')[0];
    const posListEl = (exteriorEl || featureEl).getElementsByTagNameNS('*', 'posList')[0];
    if (!posListEl) continue;

    const nums = (posListEl.textContent || '').trim().split(/\s+/).map(Number);
    if (nums.length < 6) continue;

    const ring: number[][] = [];
    for (let p = 0; p < nums.length - 1; p += 2) {
      const northing = nums[p];
      const easting = nums[p + 1];
      ring.push([easting, northing]);
    }

    const props: Record<string, unknown> = {};
    for (const key of textProperties) props[key] = getText(key);
    for (const key of numericProperties) {
      const num = numericOrUndefined(getText(key));
      if (num !== undefined) props[key] = num;
    }

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: props,
    });
  }

  return { type: 'FeatureCollection', features, memberCount: memberElements.length };
}

/** Odwraca listę współrzędnych `gml:posList` (northing, easting) → GeoJSON ring [easting, northing][]. */
function posListToRing(posListEl: Element): number[][] | null {
  const nums = (posListEl.textContent || '').trim().split(/\s+/).map(Number);
  if (nums.length < 6) return null;
  const ring: number[][] = [];
  for (let p = 0; p < nums.length - 1; p += 2) {
    ring.push([nums[p + 1], nums[p]]);
  }
  return ring;
}

/**
 * Jak `parseWfsPolygonGml`, ale zachowuje otwory wewnętrzne (`gml:interior`) zamiast je
 * pomijać — potrzebne dla serwisów, których geometrie realnie mają enklawy/wyspy (np. wfsLCV
 * pokrycie terenu). Zwraca standardowy wielopierścieniowy GeoJSON `Polygon`
 * (`coordinates: [outer, ...holes]`), rozumiany bez zmian przez `extractPolygonStructures()`
 * w `geoJsonImporter.ts`. `parseWfsPolygonGml` zostaje bez zmian dla wywołujących
 * (Kraków/EGiB budynki), którzy nie potrzebują otworów.
 *
 * W przeciwieństwie do `parseWfsPolygonGml` odpytuje bezpośrednio o elementy `featureTagName`
 * w całym dokumencie, zamiast najpierw szukać tagu-owijki per obiekt — sprawdzone empirycznie,
 * że `mapy.geoportal.gov.pl` (wfsLCV) zwraca zbiorczy `gml:featureMembers` z obiektami jako
 * bezpośrednimi dziećmi, a nie osobny `gml:featureMember` na każdy obiekt (jak Kraków/EGiB).
 *
/**
 * Ekstraktuje pierścienie poligonu z tekstu WKT, np. "POLYGON ((x1 y1, x2 y2, ...), (x3 y3, ...))".
 * Zwraca tablicę pierścieni [[x, y], ...][], gdzie pierwszy pierścień to obrys zewnętrzny,
 * a kolejne to ewentualne otwory (holes).
 */
export function parseWktPolygonCoordinates(wktText: string): number[][][] | null {
  const upper = wktText.toUpperCase().trim();
  if (!upper.includes('POLYGON')) return null;

  const ringMatches = wktText.match(/\(([^()]+)\)/g);
  if (!ringMatches || ringMatches.length === 0) return null;

  const rings: number[][][] = [];
  for (const rawRing of ringMatches) {
    const clean = rawRing.replace(/[()]/g, '').trim();
    const ptPairs = clean.split(',');
    const ring: number[][] = [];
    for (const pair of ptPairs) {
      const parts = pair.trim().split(/\s+/).map(Number);
      if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        // WKT z GUGiK (wfsLCV / EPSG:2180): pierwszy element to northing (X ~500k),
        // drugi to easting (Y ~350k/630k). Konwertujemy na konwencję GeoJSON [easting, northing],
        // dokładnie tak samo jak `posListToRing`.
        ring.push([parts[1], parts[0]]);
      }
    }
    if (ring.length >= 3) {
      rings.push(ring);
    }
  }

  return rings.length > 0 ? rings : null;
}

/**
 * Jak `parseWfsPolygonGml`, ale zachowuje otwory wewnętrzne (`gml:interior` lub WKT) zamiast je
 * pomijać — potrzebne dla serwisów, których geometrie realnie mają enklawy/wyspy (np. wfsLCV
 * pokrycie terenu). Zwraca standardowy wielopierścieniowy GeoJSON `Polygon`
 * (`coordinates: [outer, ...holes]`), rozumiany bez zmian przez `extractPolygonStructures()`
 * w `geoJsonImporter.ts`. Obsługuje zarówno strukturę GML (exterior/interior/posList), jak
 * i format WKT (`<lcv:geometry>POLYGON ((...))</lcv:geometry>`) zwracany przez GeoServer GUGiK.
 *
 * `referenceProperties` odczytuje atrybut `xlink:href` pierwszego dopasowanego elementu
 * (np. `class` w `lcv:LandCoverObservation`, reprezentowany jako `gml:ReferenceType` bez
 * treści tekstowej) zamiast `textContent`.
 */
export function parseWfsPolygonGmlWithHoles(
  gml: string,
  featureTagName: string,
  textProperties: string[],
  referenceProperties: string[] = []
): ParsedGmlResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gml, 'text/xml');
  const features: GeoJsonFeatureCollection['features'] = [];

  const featureElements = doc.getElementsByTagNameNS('*', featureTagName);

  for (let i = 0; i < featureElements.length; i++) {
    const featureEl = featureElements[i];

    const getText = (tagName: string): string => {
      const els = featureEl.getElementsByTagNameNS('*', tagName);
      return els.length > 0 ? (els[0].textContent || '').trim() : '';
    };

    const getReferenceHref = (tagName: string): string => {
      const els = featureEl.getElementsByTagNameNS('*', tagName);
      if (els.length === 0) return '';
      return els[0].getAttributeNS('http://www.w3.org/1999/xlink', 'href') || els[0].getAttribute('xlink:href') || '';
    };

    let coordinates: number[][][] | null = null;

    // 1. Sprawdź format WKT w węźle geometrii (np. <lcv:geometry>POLYGON ((...))</lcv:geometry>)
    const geomEl = featureEl.getElementsByTagNameNS('*', 'geometry')[0];
    if (geomEl && geomEl.textContent) {
      const wktRings = parseWktPolygonCoordinates(geomEl.textContent);
      if (wktRings) coordinates = wktRings;
    }

    // 2. Jeśli brak WKT, sprawdź strukturę GML (gml:exterior / gml:posList)
    if (!coordinates) {
      const exteriorEl = featureEl.getElementsByTagNameNS('*', 'exterior')[0];
      const outerPosListEl = (exteriorEl || featureEl).getElementsByTagNameNS('*', 'posList')[0];
      if (outerPosListEl) {
        const outerRing = posListToRing(outerPosListEl);
        if (outerRing) {
          coordinates = [outerRing];
          const interiorElements = featureEl.getElementsByTagNameNS('*', 'interior');
          for (let h = 0; h < interiorElements.length; h++) {
            const holePosListEl = interiorElements[h].getElementsByTagNameNS('*', 'posList')[0];
            if (!holePosListEl) continue;
            const holeRing = posListToRing(holePosListEl);
            if (holeRing) coordinates.push(holeRing);
          }
        }
      }
    }

    if (!coordinates || coordinates.length === 0) continue;

    const props: Record<string, unknown> = {};
    for (const key of textProperties) props[key] = getText(key);
    for (const key of referenceProperties) {
      const href = getReferenceHref(key);
      if (href) props[key] = href;
    }

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates },
      properties: props,
    });
  }

  return { type: 'FeatureCollection', features, memberCount: featureElements.length };
}

/**
 * Parsuje odpowiedź GML z liniami (LineString / MultiLineString) na GeoJsonFeatureCollection.
 */
export function parseWfsLineStringGml(
  gml: string,
  featureTagName: string,
  textProperties: string[]
): ParsedGmlResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gml, 'text/xml');
  const features: GeoJsonFeatureCollection['features'] = [];

  const featureElements = doc.getElementsByTagNameNS('*', featureTagName);

  for (let i = 0; i < featureElements.length; i++) {
    const featureEl = featureElements[i];

    const getText = (tagName: string): string => {
      const els = featureEl.getElementsByTagNameNS('*', tagName);
      return els.length > 0 ? (els[0].textContent || '').trim() : '';
    };

    const posListEl = featureEl.getElementsByTagNameNS('*', 'posList')[0];
    if (!posListEl) continue;

    const line = posListToRing(posListEl);
    if (!line || line.length < 2) continue;

    const props: Record<string, unknown> = {};
    for (const key of textProperties) props[key] = getText(key);

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line },
      properties: props,
    });
  }

  return { type: 'FeatureCollection', features, memberCount: featureElements.length };
}

