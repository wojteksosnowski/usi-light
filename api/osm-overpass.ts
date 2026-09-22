import type { VercelRequest, VercelResponse } from '@vercel/node';

// Proxy dla zapytań Overpass API (import budynków OSM) — przenosi fetch() z przeglądarki
// (podatny na CORS/timeouty/lokalne blokady sieciowe na maszynie deweloperskiej) na serwer,
// gdzie Node fetch() nie podlega ograniczeniom CORS i ma zwykle stabilniejsze wyjście sieciowe.
// Klient (osmBuildingsClient.ts) wysyła to samo ciało `data=<Overpass QL>`, jakie wcześniej
// wysyłał bezpośrednio do mirrorów.
//
// Kolejność ma znaczenie: `overpass-api.de` to GŁÓWNA, oficjalna instancja Overpass —
// ta sama, której domyślnie używa overpass-turbo.eu. Ręczny test użytkownika przez
// overpass-turbo.eu (czyli w praktyce właśnie ten endpoint) zwracał od razu PEŁNY, poprawny
// wynik dla lokalizacji, w której nasz import gubił budynki. Zamiast ścigać kilka mirrorów
// równolegle i zgadywać, który dał pełniejszą odpowiedź (poprzednie podejście — patrz git
// historia tego pliku — powodowało realny bug: 939 vs 243 budynków dla tego samego bboxa
// w dwóch kolejnych importach), po prostu UFAMY głównemu endpointowi i dajemy mu tyle czasu,
// ile potrzebuje. Pozostałe mirrory to WYŁĄCZNIE awaryjny fallback, próbowany sekwencyjnie,
// tylko gdy główny endpoint faktycznie zawiedzie (błąd HTTP/sieć/timeout) — nie gdy zwróci
// mało elementów, bo "mało" jest nie do odróżnienia od poprawnego wyniku bez porównywania
// mirrorów, a właśnie to porównywanie było źródłem niedeterminizmu.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Budżet czasowy klienta (AbortError) to 55s (OVERPASS_REQUEST_TIMEOUT_MS w
// osmBuildingsClient.ts) — cały łańcuch prób (główny endpoint + fallbacki) musi się w nim
// zmieścić z zapasem. Zapytanie ma własny budżet [timeout:45] (Overpass QL, patrz
// fetchOsmBuildings) — HTTP timeout głównego endpointu MUSI być większy niż 45s, inaczej
// przerwiemy połączenie własnym AbortController, zanim Overpass zdąży dokończyć zapytanie
// w swoim wewnętrznym budżecie (czyli sami ucinalibyśmy tę "pełną odpowiedź", o którą chodzi).
const PRIMARY_TIMEOUT_MS = 48000;
const FALLBACK_TIMEOUT_MS = 4000;
const TOTAL_BUDGET_MS = 52000;

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
        throw new Error(`Endpoint ${endpoint} zwrócił HTTP ${upstreamRes.status}.`);
      }
      const text = await upstreamRes.text();
      if (!text.startsWith('{')) {
        throw new Error(`Endpoint ${endpoint} zwrócił nieoczekiwaną odpowiedź.`);
      }
      try {
        JSON.parse(text);
      } catch {
        throw new Error(`Endpoint ${endpoint} zwrócił niepoprawny JSON.`);
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  };

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const errors: Error[] = [];

  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) break;

    const endpoint = OVERPASS_ENDPOINTS[i];
    const wantedTimeout = i === 0 ? PRIMARY_TIMEOUT_MS : FALLBACK_TIMEOUT_MS;
    const timeoutMs = Math.min(wantedTimeout, remaining);

    try {
      const text = await attemptEndpoint(endpoint, timeoutMs);
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(text);
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  console.error(
    'Błąd proxy Overpass (żaden endpoint nie odpowiedział poprawnie):',
    errors.map((e) => e.message)
  );
  const lastError = errors[errors.length - 1] || null;
  return res.status(502).json({
    error: `Nie udało się pobrać budynków z OpenStreetMap (Overpass API): ${lastError?.message || 'Błąd połączenia'}`,
  });
}
