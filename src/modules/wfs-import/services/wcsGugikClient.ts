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
  // Use serverless API proxy to avoid browser CORS restrictions on GUGiK WCS
  const params = new URLSearchParams({
    coverageId,
    xmin: String(Math.floor(minX)),
    ymin: String(Math.floor(minY)),
    xmax: String(Math.ceil(maxX)),
    ymax: String(Math.ceil(maxY)),
  });

  const res = await fetch(`/api/nmt?${params}`, { signal });
  if (!res.ok) throw new Error(`NMT/NMPT (DSM) proxy: ${res.status}`);
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
  // Use serverless API proxy to avoid browser CORS restrictions on GUGiK WCS
  const params = new URLSearchParams({
    coverageId,
    xmin: String(Math.floor(minX)),
    ymin: String(Math.floor(minY)),
    xmax: String(Math.ceil(maxX)),
    ymax: String(Math.ceil(maxY)),
  });

  const res = await fetch(`/api/nmt?${params}`, { signal });
  if (!res.ok) throw new Error(`NMT (DTM) proxy: ${res.status}`);
  const text = await res.text();
  return parseAaigrid(text);
}
