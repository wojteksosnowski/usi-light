/**
 * Klient WFS dla warszawskich serwisów:
 * - Budynki i działki: wms2.um.warszawa.pl (WFS 2.0, GeoJSON)
 * - Drzewa: wfs.um.warszawa.pl (WFS 1.1.0, GML)
 */

const WARSAW_WFS_URL = 'https://wms2.um.warszawa.pl/geoserver/wfs/wfs';
const TREES_WFS_URL = 'https://wfs.um.warszawa.pl/serwis';

/** Bbox w EPSG:4326: [west, south, east, north] */
export type WfsBbox = [number, number, number, number];

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
    bbox: `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`,
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
    bbox: `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`,
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
