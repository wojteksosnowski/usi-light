/**
 * Klient WFS dla warszawskich serwisów:
 * - Budynki i działki: wms2.um.warszawa.pl (WFS 2.0, GeoJSON)
 * - Drzewa: wfs.um.warszawa.pl (WFS 1.1.0, GML)
 */

const WARSAW_WFS_URL = 'https://wms2.um.warszawa.pl/geoserver/wfs/wfs';
const TREES_WFS_URL = 'https://wfs.um.warszawa.pl/serwis';

/** Bbox w EPSG:4326: [west, south, east, north] */
export type WfsBbox = [number, number, number, number];

import { wgs84ToCadPoint, CrsDetectionResult } from '../../../utils/geoTransform';

export const EPSG_2178: CrsDetectionResult = {
  crs: 'EPSG:2178',
  description: 'PL-2000 strefa 7',
  geodeticLabel: 'ETRF2000-PL / CS2000 / 21',
  isGeodetic: true,
  zone: 7,
};

export const EPSG_2177: CrsDetectionResult = {
  crs: 'EPSG:2177',
  description: 'PL-2000 strefa 6',
  geodeticLabel: 'ETRF2000-PL / CS2000 / 18',
  isGeodetic: true,
  zone: 6,
};

/** Rogi bboxa WGS84 [west, south, east, north] przeliczone na dany CRS. */
export function wgs84BboxToEpsgBounds(
  bbox: WfsBbox,
  targetCrs: CrsDetectionResult
): { minE: number; minN: number; maxE: number; maxN: number } {
  const [west, south, east, north] = bbox;
  const sw = wgs84ToCadPoint({ lat: south, lon: west }, targetCrs);
  const ne = wgs84ToCadPoint({ lat: north, lon: east }, targetCrs);
  return {
    minE: Math.min(sw.x, ne.x),
    minN: Math.min(sw.y, ne.y),
    maxE: Math.max(sw.x, ne.x),
    maxN: Math.max(sw.y, ne.y),
  };
}

/** Rogi bboxa WGS84 [west, south, east, north] przeliczone na EPSG:2178. */
export function wgs84BboxToEpsg2178Bounds(bbox: WfsBbox): { minE: number; minN: number; maxE: number; maxN: number } {
  return wgs84BboxToEpsgBounds(bbox, EPSG_2178);
}

/**
 * Konwertuje bbox WGS84 [west, south, east, north] na bbox EPSG:2178
 * w kolejności northing, easting (wymaganej przez GeoServer).
 */
export function wgs84BboxToEpsg2178(bbox: WfsBbox): string {
  const { minE, minN, maxE, maxN } = wgs84BboxToEpsg2178Bounds(bbox);
  return `${minN},${minE},${maxN},${maxE}`;
}

/**
 * Konwertuje bbox WGS84 [west, south, east, north] na bbox EPSG:2178
 * w kolejności easting, northing (wymaganej przez niektóre serwery MapServer/GeoServer).
 */
export function wgs84BboxToEpsg2178EN(bbox: WfsBbox): string {
  const { minE, minN, maxE, maxN } = wgs84BboxToEpsg2178Bounds(bbox);
  return `${minE},${minN},${maxE},${maxN}`;
}

/** Rogi bboxa WGS84 [west, south, east, north] przeliczone na EPSG:2177. */
export function wgs84BboxToEpsg2177Bounds(bbox: WfsBbox): { minE: number; minN: number; maxE: number; maxN: number } {
  return wgs84BboxToEpsgBounds(bbox, EPSG_2177);
}

/**
 * Konwertuje bbox WGS84 [west, south, east, north] na bbox EPSG:2177
 * w kolejności northing, easting.
 */
export function wgs84BboxToEpsg2177(bbox: WfsBbox): string {
  const { minE, minN, maxE, maxN } = wgs84BboxToEpsg2177Bounds(bbox);
  return `${minN},${minE},${maxN},${maxE}`;
}

/**
 * Konwertuje bbox WGS84 [west, south, east, north] na bbox EPSG:2177
 * w kolejności easting, northing.
 */
export function wgs84BboxToEpsg2177EN(bbox: WfsBbox): string {
  const { minE, minN, maxE, maxN } = wgs84BboxToEpsg2177Bounds(bbox);
  return `${minE},${minN},${maxE},${maxN}`;
}

export interface GeoJsonFeatureCollection {
  type: string;
  features: Array<{
    type: string;
    geometry: {
      type: string;
      coordinates: number[] | number[][] | number[][][] | number[][][][];
    } | null;
    properties: Record<string, unknown> | null;
  }>;
}

const WFS_REQUEST_TIMEOUT_MS = 10000;

export async function fetchWarsawBuildings(bbox: WfsBbox): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'wfs:budynki',
    bbox: wgs84BboxToEpsg2178(bbox),
    outputFormat: 'application/json',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WFS_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${WARSAW_WFS_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`WFS buildings: ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWarsawParcels(bbox: WfsBbox): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'wfs:dzialki',
    bbox: wgs84BboxToEpsg2178(bbox),
    outputFormat: 'application/json',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WFS_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${WARSAW_WFS_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`WFS parcels: ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drzewa — WFS 1.1.0, parametr typeName (singular), format GML.
 * Parsowanie GML → surowe obiekty z atrybutami.
 */
export async function fetchWarsawTrees(
  bbox: WfsBbox
): Promise<RawTreeFeature[]> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.1.0',
    request: 'GetFeature',
    typeName: 'ns92528565:ZIELEN_DRZEWA',
    bbox: `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]},EPSG:4326`,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WFS_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${TREES_WFS_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`WFS trees: ${res.status}`);
    const gmlText = await res.text();
    return parseTreesGml(gmlText);
  } finally {
    clearTimeout(timer);
  }
}

export interface RawTreeFeature {
  objectId: number;
  inventoryNumber: string;
  namePolish: string;
  nameLatin: string;
  height: number;
  trunkCircumference: string;
  managingUnit: string;
  updatedAt: string;
  x: number;
  y: number;
  srs: string;
}

function parseTreesGml(gml: string): RawTreeFeature[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gml, 'text/xml');
  const features: RawTreeFeature[] = [];

  const memberElements = doc.getElementsByTagNameNS('*', 'featureMember');

  for (let i = 0; i < memberElements.length; i++) {
    const member = memberElements[i];
    const treeEl = member.getElementsByTagNameNS('*', 'ZIELEN_DRZEWA')[0]
      || member.firstElementChild;
    if (!treeEl) continue;

    const getText = (tagName: string): string => {
      const els = treeEl.getElementsByTagNameNS('*', tagName);
      return els.length > 0 ? (els[0].textContent || '').trim() : '';
    };

    const posEl = treeEl.getElementsByTagNameNS('http://www.opengis.net/gml', 'pos')[0];
    let x = 0, y = 0, srs = 'EPSG:2178';

    if (posEl) {
      const coords = posEl.textContent?.trim().split(/\s+/) || [];
      x = parseFloat(coords[0]) || 0;
      y = parseFloat(coords[1]) || 0;
      const pointEl = posEl.parentElement;
      srs = pointEl?.getAttribute('srsName') || 'EPSG:2178';
    }

    features.push({
      objectId: parseInt(getText('OBJECTID')) || 0,
      inventoryNumber: getText('NUMER_INWENTARYZACYJNY'),
      namePolish: getText('NAZWA_POLSKA'),
      nameLatin: getText('NAZWA_LACINSKA'),
      height: parseFloat(getText('WYSOKOSC')) || 0,
      trunkCircumference: getText('OBWOD_PNIA_W_CM'),
      managingUnit: getText('JEDNOSTKA_ZARZADZAJACA'),
      updatedAt: getText('AKTUALNOSC_DANYCH'),
      x,
      y,
      srs,
    });
  }

  return features;
}
