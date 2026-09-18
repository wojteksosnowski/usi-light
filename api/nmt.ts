import type { VercelRequest, VercelResponse } from '@vercel/node';

const NMT_WCS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel';
const NMPT_WCS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers dla frontendu
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
  }

  const coverageId = req.query.coverageId as string;
  if (!coverageId || !['DTM_PL-KRON86-NH', 'DSM_PL-KRON86-NH', 'DTM_PL-EVRF2007-NH', 'DSM_PL-EVRF2007-NH'].includes(coverageId)) {
    return res.status(400).json({ error: 'Nieprawidłowy CoverageId.' });
  }

  const subsettingCRS = req.query.subsettingCRS as string || 'http://www.opengis.net/def/crs/EPSG/0/2180';
  const xmin = req.query.xmin as string;
  const ymin = req.query.ymin as string;
  const xmax = req.query.xmax as string;
  const ymax = req.query.ymax as string;

  if (!xmin || !ymin || !xmax || !ymax) {
    return res.status(400).json({ error: 'Brak parametrów bbox: xmin, ymin, xmax, ymax.' });
  }

  // Użyj właściwego URL w zależności od typu zapytania
  const baseUrl = coverageId.startsWith('DTM') ? NMT_WCS_URL : NMPT_WCS_URL;

  const params = new URLSearchParams({
    service: 'WCS',
    version: '2.0.1',
    request: 'GetCoverage',
    CoverageId: coverageId,
    format: 'image/x-aaigrid',
    subsettingCRS,
  });
  params.append('subset', `x(${xmin},${xmax})`);
  params.append('subset', `y(${ymin},${ymax})`);

  try {
    const upstreamRes = await fetch(`${baseUrl}?${params}`);
    
    // Przekaz nagłówki i body bez modyfikacji
    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    
    // Wyczyść wszystkie CORS-origin headers z upstreama — używamy własnych
    res.removeHeader('access-control-allow-origin');
    res.removeHeader('access-control-allow-credentials');
    
    // Dodajemy własne CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

    const body = await upstreamRes.text();
    return res.status(upstreamRes.status).send(body);
  } catch (err) {
    console.error(`Błąd proxy NMT WCS (${baseUrl}):`, err instanceof Error ? err.message : String(err));
    return res.status(502).json({ error: 'Nie udało się pobrać danych NMT z GUGiK.' });
  }
}
