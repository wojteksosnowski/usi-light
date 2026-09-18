/** Determinuje czy działamy w środowisku browser (może użyć /api/proxy) vs Node/vitest (direct fetch). */
const isBrowserEnv = typeof window !== 'undefined' && window.location?.origin;

const NMT_WCS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel';
const NMPT_WCS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel';

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

  if (ncols === 0 || nrows === 0 || values.length === 0) {
    throw new Error(`Invalid AAIGRID response: missing header or empty data (ncols=${ncols}, nrows=${nrows}, received ${lines.length} lines)`);
  }

  return { ncols, nrows, xllcorner, yllcorner, cellsize, nodata, data: new Float32Array(values) };
}

function buildWcsParams(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  coverageId: string,
  resolutionMeters: number = 1.0
): URLSearchParams {
  return new URLSearchParams({
    SERVICE: 'WCS',
    VERSION: '1.0.0',
    REQUEST: 'GetCoverage',
    COVERAGE: coverageId,
    coverageId,
    FORMAT: 'AAIGRID',
    CRS: 'EPSG:2180',
    RESPONSE_CRS: 'EPSG:2180',
    BBOX: `${Math.floor(minX)},${Math.floor(minY)},${Math.ceil(maxX)},${Math.ceil(maxY)}`,
    RESX: String(resolutionMeters),
    RESY: String(resolutionMeters),
    resx: String(resolutionMeters),
    resy: String(resolutionMeters),
    xmin: String(Math.floor(minX)),
    ymin: String(Math.floor(minY)),
    xmax: String(Math.ceil(maxX)),
    ymax: String(Math.ceil(maxY)),
  });
}

/**
 * Pomocnicza funkcja wykonująca zapytanie HTTP z ponawianiem próby i czytelną obsługą błędów.
 */
async function fetchWcsWithClientRetry(
  url: string,
  serviceName: string,
  signal?: AbortSignal,
  maxRetries: number = 2
): Promise<string> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal });
      if (res.ok) {
        return await res.text();
      }

      let errorDetail = '';
      try {
        const json = await res.json();
        errorDetail = json.details || json.error || '';
      } catch {
        errorDetail = await res.text().catch(() => '');
      }

      const msg = errorDetail ? `${res.status} (${errorDetail})` : `${res.status}`;
      if (res.status >= 500 && attempt < maxRetries) {
        console.warn(`[wcsGugikClient] ${serviceName} returned ${res.status} on attempt ${attempt}, retrying...`);
        await new Promise((r) => setTimeout(r, attempt * 800));
        continue;
      }
      throw new Error(`${serviceName}: ${msg}`);
    } catch (err: any) {
      lastError = err;
      if (signal?.aborted) throw err;
      if (attempt < maxRetries) {
        console.warn(`[wcsGugikClient] ${serviceName} attempt ${attempt} failed, retrying...`, err?.message);
        await new Promise((r) => setTimeout(r, attempt * 800));
      }
    }
  }

  throw lastError || new Error(`Nie udało się pobrać danych z ${serviceName}`);
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
  const params = buildWcsParams(minX, minY, maxX, maxY, coverageId);
  const targetUrl = isBrowserEnv ? `/api/nmt?${params.toString()}` : `${NMPT_WCS_URL}?${params.toString()}`;
  const text = await fetchWcsWithClientRetry(targetUrl, 'NMPT (DSM)', signal);
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
  const params = buildWcsParams(minX, minY, maxX, maxY, coverageId);
  const targetUrl = isBrowserEnv ? `/api/nmt?${params.toString()}` : `${NMT_WCS_URL}?${params.toString()}`;
  const text = await fetchWcsWithClientRetry(targetUrl, 'NMT (DTM)', signal);
  return parseAaigrid(text);
}
