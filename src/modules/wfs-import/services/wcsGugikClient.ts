const NMPT_WCS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel';
const NMT_WCS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel';

export interface AaigridData {
  ncols: number;
  nrows: number;
  xllcorner: number;
  yllcorner: number;
  cellsize: number;
  nodata: number;
  data: Float32Array;
}

export function parseAaigrid(text: string): AaigridData {
  const lines = text.trim().split('\n');
  let ncols = 0, nrows = 0, nodata = -9999;
  let xllcorner = 0, yllcorner = 0, cellsize = 1;
  let headerLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('ncols')) { ncols = parseInt(trimmed.split(/\s+/)[1], 10); headerLines++; }
    else if (trimmed.startsWith('nrows')) { nrows = parseInt(trimmed.split(/\s+/)[1], 10); headerLines++; }
    else if (trimmed.startsWith('xllcorner')) { xllcorner = parseFloat(trimmed.split(/\s+/)[1]); headerLines++; }
    else if (trimmed.startsWith('yllcorner')) { yllcorner = parseFloat(trimmed.split(/\s+/)[1]); headerLines++; }
    else if (trimmed.startsWith('cellsize')) { cellsize = parseFloat(trimmed.split(/\s+/)[1]); headerLines++; }
    else if (trimmed.startsWith('NODATA_value') || trimmed.startsWith('NODATA')) { nodata = parseFloat(trimmed.split(/\s+/)[1]); headerLines++; }
    else break;
  }

  const values: number[] = [];
  for (let i = headerLines; i < lines.length; i++) {
    const row = lines[i].trim().split(/\s+/).map(Number);
    values.push(...row);
  }

  return { ncols, nrows, xllcorner, yllcorner, cellsize, nodata, data: new Float32Array(values) };
}

/**
 * Pobiera siatkę NMPT (Digital Surface Model - powierzchnia z dachami i koronami) w formacie Arc/Info ASCII Grid.
 */
export async function fetchDsmBbox(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  coverageId: 'DSM_PL-KRON86-NH' | 'DSM_PL-EVRF2007-NH' = 'DSM_PL-KRON86-NH',
  signal?: AbortSignal
): Promise<AaigridData> {
  const params = new URLSearchParams({
    service: 'WCS',
    version: '2.0.1',
    request: 'GetCoverage',
    CoverageId: coverageId,
    format: 'image/x-aaigrid',
    subsettingCRS: 'http://www.opengis.net/def/crs/EPSG/0/2180',
  });
  params.append('subset', `x(${Math.floor(minX)},${Math.ceil(maxX)})`);
  params.append('subset', `y(${Math.floor(minY)},${Math.ceil(maxY)})`);

  const res = await fetch(`${NMPT_WCS_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`WCS NMPT (DSM): ${res.status}`);
  const text = await res.text();
  return parseAaigrid(text);
}

/**
 * Pobiera siatkę NMT (Digital Terrain Model - rzeźba samego terenu pod obiektami) w formacie Arc/Info ASCII Grid.
 */
export async function fetchDtmBbox(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  coverageId: 'DTM_PL-KRON86-NH' | 'DTM_PL-EVRF2007-NH' = 'DTM_PL-KRON86-NH',
  signal?: AbortSignal
): Promise<AaigridData> {
  const params = new URLSearchParams({
    service: 'WCS',
    version: '2.0.1',
    request: 'GetCoverage',
    CoverageId: coverageId,
    format: 'image/x-aaigrid',
    subsettingCRS: 'http://www.opengis.net/def/crs/EPSG/0/2180',
  });
  params.append('subset', `x(${Math.floor(minX)},${Math.ceil(maxX)})`);
  params.append('subset', `y(${Math.floor(minY)},${Math.ceil(maxY)})`);

  const res = await fetch(`${NMT_WCS_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`WCS NMT (DTM): ${res.status}`);
  const text = await res.text();
  return parseAaigrid(text);
}
