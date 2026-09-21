import type { VercelRequest, VercelResponse } from '@vercel/node';

// Proxy dla usług WCS GetCoverage (NMT/NMPT z GUGiK) — `mapy.geoportal.gov.pl` nie wysyła
// nagłówków CORS (ten sam host, co EGiB/LCV w api/wfs.ts), więc przeglądarka blokuje odpowiedź.
// Odpowiedź z format=image/x-aaigrid to tekst ASCII (Arc/Info grid), nie binarny obraz —
// przekazujemy ją więc jako tekst, tak jak api/wfs.ts robi to dla GML/XML.
interface WcsTargetConfig {
  upstreamUrl: string;
  allowedCoverageIds: Set<string>;
}

export const WCS_TARGETS: Record<string, WcsTargetConfig> = {
  nmt: {
    upstreamUrl: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel',
    allowedCoverageIds: new Set(['DTM_PL-KRON86-NH', 'DTM_PL-EVRF2007-NH']),
  },
  nmpt: {
    upstreamUrl: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel',
    allowedCoverageIds: new Set(['DSM_PL-KRON86-NH', 'DSM_PL-EVRF2007-NH']),
  },
};

const UPSTREAM_TIMEOUT_MS = 15000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
  }

  const targetKey = req.query.target as string;
  const config = targetKey ? WCS_TARGETS[targetKey] : undefined;
  if (!config) {
    return res.status(400).json({
      error: `Nieznany cel WCS: "${targetKey}". Dostępne: ${Object.keys(WCS_TARGETS).join(', ')}`,
    });
  }

  const serviceParam = req.query.service ?? req.query.SERVICE;
  const requestParam = req.query.request ?? req.query.REQUEST;
  const coverageId = req.query.CoverageId || req.query.coverageid || req.query.COVERAGEID;

  if (
    typeof serviceParam !== 'string' ||
    serviceParam.toUpperCase() !== 'WCS' ||
    typeof requestParam !== 'string' ||
    requestParam.toUpperCase() !== 'GETCOVERAGE' ||
    typeof coverageId !== 'string' ||
    !config.allowedCoverageIds.has(coverageId)
  ) {
    return res.status(400).json({ error: 'Nieprawidłowe parametry zapytania WCS.' });
  }

  // `subset` legitnie występuje dwa razy (x i y) — Vercel/Node parsuje powtórzony klucz
  // query jako tablicę, więc trzeba doklejać każdą wartość osobno (`append`), a nie tylko
  // string (`set`) — inaczej oba `subset` znikają i serwer WCS liczy pełny zasięg pokrycia.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'target') continue;
    if (typeof value === 'string') {
      params.append(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    }
  }

  try {
    const upstreamRes = await fetch(`${config.upstreamUrl}?${params}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await upstreamRes.text();
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'text/plain; charset=UTF-8');
    return res.status(upstreamRes.status).send(body);
  } catch (err) {
    console.error(`Błąd proxy WCS (${config.upstreamUrl}):`, err);
    return res.status(502).json({ error: 'Nie udało się połączyć z serwisem WCS.' });
  }
}
