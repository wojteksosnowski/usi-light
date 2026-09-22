import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './osm-overpass';

/**
 * Regresja: poprzednia wersja tego proxy ścigała 5 mirrorów RÓWNOLEGLE i porównywała liczbę
 * elementów, żeby zgadnąć, który dał "pełniejszą" odpowiedź — to samo w sobie było źródłem
 * niedeterminizmu (dwa identyczne importy tej samej lokalizacji dawały 939 vs 243 budynków,
 * bo wygrywał inny mirror za każdym razem). Obecne podejście: UFAMY głównemu, oficjalnemu
 * endpointowi Overpass (ten sam, którego domyślnie używa overpass-turbo.eu) i dajemy mu duży
 * budżet czasowy zamiast negocjować między mirrorami. Pozostałe mirrory to czysto awaryjny,
 * SEKWENCYJNY fallback — próbowany tylko gdy główny endpoint faktycznie zawiedzie (błąd/timeout),
 * nigdy na podstawie porównania liczby elementów.
 */

function makeRequest(): VercelRequest {
  return { method: 'POST', body: 'data=%5Bout%3Ajson%5D%3B' } as unknown as VercelRequest;
}

function makeResponse() {
  const res: {
    statusCode: number | null;
    headers: Record<string, string>;
    body: unknown;
    setHeader: (k: string, v: string) => void;
    status: (code: number) => typeof res;
    send: (body: unknown) => typeof res;
    json: (body: unknown) => typeof res;
    end: () => typeof res;
  } = {
    statusCode: null,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return res as unknown as VercelResponse & typeof res;
}

function jsonResponse(elementsCount: number) {
  const elements = Array.from({ length: elementsCount }, (_, i) => ({ type: 'way', id: i }));
  return { ok: true, status: 200, text: async () => JSON.stringify({ elements }) };
}

function errorResponse(status = 500) {
  return { ok: false, status, text: async () => 'error' };
}

describe('api/osm-overpass — sekwencyjny fallback (regresja: 939 vs 243 budynków dla tego samego bboxa)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ufa głównemu endpointowi wprost — nie porównuje go z innymi mirrorami, nawet gdyby zwrócił mniej elementów', async () => {
    fetchMock.mockImplementation((endpoint: string) => {
      if (endpoint.includes('overpass-api.de') && !endpoint.includes('lz4')) {
        return Promise.resolve(jsonResponse(243));
      }
      // Fallbacki nigdy nie powinny zostać odpytane, bo główny endpoint odpowiada poprawnie.
      return Promise.resolve(jsonResponse(939));
    });

    const res = makeResponse();
    await handler(makeRequest(), res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.elements).toHaveLength(243);
    // Tylko główny endpoint został wywołany — brak wyścigu z resztą.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('przechodzi do kolejnego mirrora TYLKO gdy główny endpoint zawiedzie (błąd/HTTP != 2xx)', async () => {
    let call = 0;
    fetchMock.mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(errorResponse(503));
      return Promise.resolve(jsonResponse(939));
    });

    const res = makeResponse();
    await handler(makeRequest(), res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.elements).toHaveLength(939);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('akceptuje pusty wynik (0 elementów) z głównego endpointu jako poprawną odpowiedź (nie zgaduje "może inny mirror ma więcej")', async () => {
    let call = 0;
    fetchMock.mockImplementation(() => {
      call++;
      return Promise.resolve(jsonResponse(call === 1 ? 0 : 50));
    });

    const res = makeResponse();
    await handler(makeRequest(), res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.elements).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('zwraca 502, gdy wszystkie endpointy (główny + fallbacki) zawiodą', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(errorResponse(503)));

    const res = makeResponse();
    await handler(makeRequest(), res);

    expect(res.statusCode).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
