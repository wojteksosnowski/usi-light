import type { VercelRequest, VercelResponse } from '@vercel/node';

const NMT_WCS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel';
const NMPT_WCS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel';

/**
 * Pobiera dane WCS z GUGiK z automatycznym ponawianiem próby (do 3 prób)
 * przy błędach sieciowych/SSL (ECONNRESET, socket hang up, ETIMEDOUT itp.).
 */
async function fetchWcsWithRetry(url: string, maxRetries: number = 3): Promise<{ ok: boolean; status: number; text: string }> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const upstreamRes = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'USI-Light/1.0 (NMT WCS client)',
          Accept: 'text/plain, */*',
          Connection: 'keep-alive',
        },
      });

      clearTimeout(timeoutId);

      const text = await upstreamRes.text();
      if (upstreamRes.ok) {
        return { ok: true, status: upstreamRes.status, text };
      }

      // Jeśli serwer GUGiK zwrócił błąd 5xx, ponawiamy
      if (upstreamRes.status >= 500 && attempt < maxRetries) {
        console.warn(`[NMT Proxy] GUGiK returned HTTP ${upstreamRes.status} on attempt ${attempt}, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 600));
        continue;
      }

      return { ok: false, status: upstreamRes.status, text };
    } catch (err: any) {
      lastError = err;
      console.warn(`[NMT Proxy] Attempt ${attempt} failed:`, err?.message || err);
      if (attempt < maxRetries) {
        // Wykładniczy backoff przed kolejną próbą
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }
  }

  throw lastError || new Error('Nie udało się nawiązać połączenia z serwerem GUGiK WCS po 3 próbach');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const {
    coverageId = 'DTM_PL-KRON86-NH',
    xmin,
    ymin,
    xmax,
    ymax,
    crs = 'EPSG:2180',
    response_crs = 'EPSG:2180',
    format = 'AAIGRID',
    resx = '1.0',
    resy = '1.0',
  } = req.query;

  if (!xmin || !ymin || !xmax || !ymax) {
    return res.status(400).json({ error: 'Brak wymaganych parametrów BBOX (xmin, ymin, xmax, ymax)' });
  }

  const covIdStr = String(coverageId);
  const isDsm = covIdStr.startsWith('DSM');
  const targetBaseUrl = isDsm ? NMPT_WCS_URL : NMT_WCS_URL;

  const wcsParams = new URLSearchParams({
    SERVICE: 'WCS',
    VERSION: '1.0.0',
    REQUEST: 'GetCoverage',
    COVERAGE: covIdStr,
    FORMAT: String(format),
    CRS: String(crs),
    RESPONSE_CRS: String(response_crs),
    BBOX: `${xmin},${ymin},${xmax},${ymax}`,
    RESX: String(resx),
    RESY: String(resy),
  });

  const fullUrl = `${targetBaseUrl}?${wcsParams.toString()}`;

  try {
    const result = await fetchWcsWithRetry(fullUrl, 3);

    if (!result.ok) {
      return res.status(result.status).send(result.text || `Upstream WCS error ${result.status}`);
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(result.text);
  } catch (err: any) {
    console.error('NMT WCS proxy error:', err);
    return res.status(502).json({
      error: 'Nie udało się połączyć z usługą GUGiK NMT WCS',
      details: err?.message || 'Błąd sieci lub timeout serwera GUGiK',
    });
  }
}
