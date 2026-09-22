// mapy.geoportal.gov.pl nie wysyła nagłówków CORS (ten sam host, co EGiB/LCV) — żądania
// idą przez serverless proxy /api/wcs (api/wcs.ts) zamiast bezpośrednio z przeglądarki.
const NMPT_WCS_URL = '/api/wcs?target=nmpt';
const NMT_WCS_URL = '/api/wcs?target=nmt';

export interface AaigridData {
  ncols: number;
  nrows: number;
  xllcorner: number;
  yllcorner: number;
  cellsize: number;
  nodata: number;
  data: Float32Array;
}

// Serwer WCS GUGiK (mapy.geoportal.gov.pl) opakowuje odpowiedź GetCoverage w
// `multipart/related; boundary=wcs`, niezależnie od żądanego formatu — czysty tekst AAIGrid
// zaczyna się dopiero po nagłówkach MIME tej części i kończy przed domykającym markerem granicy.
// Bez zdjęcia tej otoczki `parseAaigrid` odczytałby linie MIME jako dane siatki.
function stripMultipartWrapper(text: string): string {
  const start = text.indexOf('ncols');
  if (start === -1) return text;
  const rest = text.slice(start);
  const boundaryIdx = rest.indexOf('\n--wcs');
  return boundaryIdx === -1 ? rest : rest.slice(0, boundaryIdx);
}

export function parseAaigrid(rawText: string): AaigridData {
  const text = stripMultipartWrapper(rawText);
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

const WCS_DEFAULT_TIMEOUT_MS = 10000;

// Zabezpieczenie przed regresją, gdzie błędna obwiednia (np. odstający budynek z importu
// OSM/WFS) rozdyma zapytanie do rozmiaru całego kraju — serwer WCS GUGiK i tak odrzuca
// takie żądania 400-tką, ale wtedy błąd jest nieczytelny; tu odrzucamy go wcześniej,
// z jasnym komunikatem, zamiast wysyłać je w ogóle.
const MAX_WCS_BBOX_SPAN_M = 5000;

function assertReasonableBboxSpan(minX: number, minY: number, maxX: number, maxY: number): void {
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX > MAX_WCS_BBOX_SPAN_M || spanY > MAX_WCS_BBOX_SPAN_M) {
    throw new Error(
      `Obwiednia zapytania WCS jest zbyt duża (${Math.round(spanX)}m × ${Math.round(spanY)}m, limit ${MAX_WCS_BBOX_SPAN_M}m) — ` +
      'prawdopodobnie błędne dane wejściowe (np. odstający obiekt z importu).'
    );
  }
}

function createCombinedSignal(userSignal?: AbortSignal, timeoutMs = WCS_DEFAULT_TIMEOUT_MS): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onUserAbort = () => controller.abort();
  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort();
    } else {
      userSignal.addEventListener('abort', onUserAbort);
    }
  }

  const cleanup = () => {
    clearTimeout(timer);
    if (userSignal) {
      userSignal.removeEventListener('abort', onUserAbort);
    }
  };

  return { signal: controller.signal, cleanup };
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
  assertReasonableBboxSpan(minX, minY, maxX, maxY);
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

  const { signal: effectiveSignal, cleanup } = createCombinedSignal(signal);
  try {
    const res = await fetch(`${NMPT_WCS_URL}&${params}`, { signal: effectiveSignal });
    if (!res.ok) throw new Error(`WCS NMPT (DSM): ${res.status}`);
    const text = await res.text();
    return parseAaigrid(text);
  } finally {
    cleanup();
  }
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
  assertReasonableBboxSpan(minX, minY, maxX, maxY);
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

  const { signal: effectiveSignal, cleanup } = createCombinedSignal(signal);
  try {
    const res = await fetch(`${NMT_WCS_URL}&${params}`, { signal: effectiveSignal });
    if (!res.ok) throw new Error(`WCS NMT (DTM): ${res.status}`);
    const text = await res.text();
    return parseAaigrid(text);
  } finally {
    cleanup();
  }
}

