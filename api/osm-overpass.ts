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

  const attemptEndpoint = async (endpoint: string, timeoutMs: number): Promise<{ text: string; elementsCount: number }> => {
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
      let elementsCount = 0;
      try {
        elementsCount = JSON.parse(text)?.elements?.length ?? 0;
      } catch {
        throw new Error(`Mirror ${endpoint} zwrócił niepoprawny JSON.`);
      }
      return { text, elementsCount };
    } finally {
      clearTimeout(timer);
    }
  };

  // Nie wystarczy wziąć pierwszej udanej (HTTP 200 + poprawny JSON) odpowiedzi (jak robił
  // dawniej Promise.any) — część publicznych mirrorów (zwłaszcza mniej znane, dodane niedawno:
  // overpass.osm.ch, overpass.private.coffee) potrafi zwrócić poprawny, ale PUSTY wynik
  // (`elements: []`) dla obszaru, w którym inne mirrory mają pełne dane — np. przez replication
  // lag albo węższy zasięg regionalny tej instancji. Taka pusta-ale-"poprawna" odpowiedź, gdyby
  // wygrała wyścig, cicho udawałaby "brak budynków w tym miejscu" zamiast prawdziwego wyniku.
  // Dlatego: rozstrzygamy na rzecz PIERWSZEGO NIEPUSTEGO wyniku (szybka ścieżka przy sukcesie),
  // ale pusty wynik nie kończy wyścigu — czekamy na resztę mirrorów i tylko jeśli WSZYSTKIE dadzą
  // 0 elementów (albo błąd), uznajemy to za faktycznie pusty obszar / awarię.
  const raceForNonEmpty = (
    endpoints: string[],
    timeoutMs: number
  ): Promise<{ text: string } | { errors: Error[] }> =>
    new Promise((resolve) => {
      let remaining = endpoints.length;
      let emptyText: string | null = null;
      const errors: Error[] = [];
      let settled = false;

      const finishIfDone = () => {
        if (settled || remaining > 0) return;
        settled = true;
        resolve(emptyText !== null ? { text: emptyText } : { errors });
      };

      for (const endpoint of endpoints) {
        attemptEndpoint(endpoint, timeoutMs).then(
          (result) => {
            remaining--;
            if (settled) return;
            if (result.elementsCount > 0) {
              settled = true;
              resolve({ text: result.text });
              return;
            }
            if (emptyText === null) emptyText = result.text;
            finishIfDone();
          },
          (err) => {
            remaining--;
            if (settled) return;
            errors.push(err instanceof Error ? err : new Error(String(err)));
            finishIfDone();
          }
        );
      }
    });

  const runRound = (timeoutMs: number) => raceForNonEmpty(OVERPASS_ENDPOINTS, timeoutMs);

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
