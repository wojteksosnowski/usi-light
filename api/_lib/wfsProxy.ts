import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Fabryka proxy dla serwisów WFS EGiB, które nie wysyłają nagłówków CORS —
 * przeglądarka blokuje bezpośredni fetch() z frontendu, więc zapytanie idzie
 * przez backend (CORS dotyczy tylko przeglądarek), a odpowiedź wraca z własnymi
 * nagłówkami CORS. Współdzielone przez api/krakow-wfs.ts i api/egib-wfs.ts —
 * różnią się tylko adresem upstreamu, whitelistą warstw i wielkością liter
 * parametru TYPENAME (Kraków: WFS 1.1.0, wielkie litery; EGiB: WFS 2.0.0, małe).
 *
 * Ten plik MUSI zostać w katalogu `_lib/` (prefiks `_`) — konwencja Vercela
 * wyklucza takie pliki z routingu na serverless functions, więc `createWfsProxyHandler`
 * pozostaje zwykłym modułem pomocniczym, a nie osobnym (nieużywanym) endpointem
 * pod `/api/_lib/wfsProxy`. Nie przenosić/zmieniać nazwy bez świadomości tej konwencji.
 */
export function createWfsProxyHandler(
  upstreamUrl: string,
  allowedTypeNames: Set<string>,
  typeNameParam: string
) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
    }

    const serviceParam = req.query.SERVICE ?? req.query.service;
    const typeNameValue = req.query[typeNameParam];

    if (
      typeof serviceParam !== 'string' || serviceParam.toUpperCase() !== 'WFS' ||
      typeof typeNameValue !== 'string' || !allowedTypeNames.has(typeNameValue)
    ) {
      return res.status(400).json({ error: 'Nieprawidłowe parametry zapytania WFS.' });
    }

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') params.set(key, value);
    }

    try {
      const upstreamRes = await fetch(`${upstreamUrl}?${params}`);
      const body = await upstreamRes.text();
      res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'text/xml; charset=UTF-8');
      return res.status(upstreamRes.status).send(body);
    } catch (err) {
      console.error(`Błąd proxy WFS (${upstreamUrl}):`, err);
      return res.status(502).json({ error: 'Nie udało się połączyć z serwisem WFS.' });
    }
  };
}
