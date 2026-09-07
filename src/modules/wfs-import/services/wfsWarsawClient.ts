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

const EPSG_2178: CrsDetectionResult = {
  crs: 'EPSG:2178',
  description: 'PL-2000 strefa 7',
  geodeticLabel: 'ETRF2000-PL / CS2000 / 21',
  isGeodetic: true,
  zone: 7,
};

/**
 * Konwertuje bbox WGS84 [west, south, east, north] na bbox EPSG:2178
 * w kolejności northing, easting (wymaganej przez GeoServer).
 */
function wgs84BboxToEpsg2178(bbox: WfsBbox): string {
  const [west, south, east, north] = bbox;
  const sw = wgs84ToCadPoint({ lat: south, lon: west }, EPSG_2178);
  const ne = wgs84ToCadPoint({ lat: north, lon: east }, EPSG_2178);
  const minN = Math.min(sw.y, ne.y);
  const minE = Math.min(sw.x, ne.x);
  const maxN = Math.max(sw.y, ne.y);
  const maxE = Math.max(sw.x, ne.x);
  return `${minN},${minE},${maxN},${maxE}`;
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

export async function fetchWarsawBuildings(bbox: WfsBbox): Promise<GeoJsonFeatureCollection> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'wfs:budynki',
    bbox: wgs84BboxToEpsg2178(bbox),
    outputFormat: 'application/json',
  });

  const res = await fetch(`${WARSAW_WFS_URL}?${params}`);
  if (!res.ok) throw new Error(`WFS buildings: ${res.status}`);
  return res.json();
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

  const res = await fetch(`${WARSAW_WFS_URL}?${params}`);
  if (!res.ok) throw new Error(`WFS parcels: ${res.status}`);
  return res.json();
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

  const res = await fetch(`${TREES_WFS_URL}?${params}`);
  if (!res.ok) throw new Error(`WFS trees: ${res.status}`);
  const gmlText = await res.text();
  return parseTreesGml(gmlText);
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
