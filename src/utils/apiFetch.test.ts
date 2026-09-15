import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchJson } from './apiFetch';

describe('fetchJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('zwraca sparsowane dane przy poprawnej odpowiedzi JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ licenseKey: 'USI-30D-AAAA-BBBB' })),
    }));

    const result = await fetchJson('/api/license/trial', { method: 'POST' });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ licenseKey: 'USI-30D-AAAA-BBBB' });
  });

  it('rzuca czytelny błąd zamiast surowego SyntaxError, gdy odpowiedź nie jest JSON-em', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('A server error has occurred'),
    }));

    await expect(fetchJson('/api/stripe/verify-session')).rejects.toThrow(
      /Serwer zwrócił nieprawidłową odpowiedź \(status 500\)/
    );
  });

  it('traktuje pustą odpowiedź jako pusty obiekt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    }));

    const result = await fetchJson('/api/license/check');
    expect(result.data).toEqual({});
  });
});
