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
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Mirrory odpytujemy RÓWNOLEGLE (nie sekwencyjnie) — sekwencyjne próby sumowały się do
// ~60s, co przekraczało budżet czasowy klienta (AbortError) zanim dotarliśmy nawet do
// drugiego mirrora. Pierwsza runda dostaje większość budżetu (30s/mirror); jeśli WSZYSTKIE
// mirrory zawiodą (częste przy chwilowym przeciążeniu/rate-limicie publicznych instancji),
// druga runda próbuje ponownie po krótkiej przerwie z krótszym timeoutem — łączny budżet
// (30s + 2s + 15s = 47s) musi zostać poniżej timeoutu klienta (55s, patrz
// OVERPASS_REQUEST_TIMEOUT_MS w osmBuildingsClient.ts).
const FIRST_ROUND_TIMEOUT_MS = 30000;
const RETRY_ROUND_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 2000;

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

  const attemptEndpoint = async (endpoint: string, timeoutMs: number): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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

      if (!upstreamRes.ok) {
        throw new Error(`Mirror ${endpoint} zwrócił HTTP ${upstreamRes.status}.`);
      }
      const text = await upstreamRes.text();
      if (!text.startsWith('{')) {
        throw new Error(`Mirror ${endpoint} zwrócił nieoczekiwaną odpowiedź.`);
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  };

  // Promise.any zwraca pierwszy sukces; jeśli WSZYSTKIE mirrory zawiodą, rzuca AggregateError.
  const runRound = async (timeoutMs: number): Promise<{ text: string } | { errors: Error[] }> => {
    const errors: Error[] = [];
    try {
      const text = await Promise.any(
        OVERPASS_ENDPOINTS.map((endpoint) =>
          attemptEndpoint(endpoint, timeoutMs).catch((err) => {
            errors.push(err instanceof Error ? err : new Error(String(err)));
            throw err;
          })
        )
      );
      return { text };
    } catch {
      return { errors };
    }
  };

  const firstRound = await runRound(FIRST_ROUND_TIMEOUT_MS);
  if ('text' in firstRound) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(firstRound.text);
  }

  // Wszystkie mirrory zawiodły za pierwszym razem — częsty objaw chwilowego
  // przeciążenia/rate-limitu publicznych instancji Overpass, który zwykle ustępuje w
  // ciągu kilku sekund. Jedna dodatkowa, krótsza runda zanim poddamy się i zwrócimy 502.
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  const secondRound = await runRound(RETRY_ROUND_TIMEOUT_MS);
  if ('text' in secondRound) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(secondRound.text);
  }

  const lastError = secondRound.errors[secondRound.errors.length - 1] || firstRound.errors[firstRound.errors.length - 1] || null;
  console.error(
    'Błąd proxy Overpass (wszystkie mirrory zawiodły, obie rundy):',
    [...firstRound.errors, ...secondRound.errors].map((e) => e.message)
  );
  return res.status(502).json({
    error: `Nie udało się pobrać budynków z OpenStreetMap (Overpass API): ${lastError?.message || 'Błąd połączenia'}`,
  });
}
