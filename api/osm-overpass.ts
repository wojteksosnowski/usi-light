import type { VercelRequest, VercelResponse } from '@vercel/node';

// Proxy dla zapytań Overpass API (import budynków OSM) — przenosi fetch() z przeglądarki
// (podatny na CORS/timeouty/lokalne blokady sieciowe na maszynie deweloperskiej) na serwer,
// gdzie Node fetch() nie podlega ograniczeniom CORS i ma zwykle stabilniejsze wyjście sieciowe.
// Klient (osmBuildingsClient.ts) wysyła to samo ciało `data=<Overpass QL>`, jakie wcześniej
// wysyłał bezpośrednio do mirrorów; ten proxy powtarza tę samą listę endpointów z failoverem.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const OVERPASS_REQUEST_TIMEOUT_MS = 20000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
  }

  // Vercel parsuje `application/x-www-form-urlencoded` do obiektu, dev middleware (vite.config.ts)
  // zostawia surowy string — obsługujemy oba, żeby zawsze wysłać dalej poprawny `data=<query>`.
  let body: string;
  if (typeof req.body === 'string') {
    body = req.body;
  } else if (req.body && typeof req.body === 'object' && typeof req.body.data === 'string') {
    body = `data=${encodeURIComponent(req.body.data)}`;
  } else {
    return res.status(400).json({ error: 'Nieprawidłowe ciało żądania Overpass.' });
  }

  let lastError: Error | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OVERPASS_REQUEST_TIMEOUT_MS);
    try {
      const upstreamRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json',
          'User-Agent': 'USILightCAD/2.5D (https://github.com/usi-light)',
        },
        body,
        signal: controller.signal,
      });

      if (upstreamRes.ok) {
        const text = await upstreamRes.text();
        if (text.startsWith('{')) {
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).send(text);
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  console.error('Błąd proxy Overpass:', lastError);
  return res.status(502).json({
    error: `Nie udało się pobrać budynków z OpenStreetMap (Overpass API): ${lastError?.message || 'Błąd połączenia'}`,
  });
}
