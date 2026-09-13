import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../api/wfs';

describe('Vercel Serverless Function /api/wfs (Unified Proxy)', () => {
  const createMockRes = () => {
    const res: any = {
      statusCode: 200,
      headers: {},
      setHeader: vi.fn((k, v) => {
        res.headers[k] = v;
      }),
      status: vi.fn((code) => {
        res.statusCode = code;
        return res;
      }),
      json: vi.fn((data) => {
        res.data = data;
        return res;
      }),
      send: vi.fn((data) => {
        res.body = data;
        return res;
      }),
      end: vi.fn(),
    };
    return res;
  };

  it('powinien obsłużyć zapytanie OPTIONS (CORS preflight)', async () => {
    const req: any = { method: 'OPTIONS', query: {} };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.end).toHaveBeenCalled();
  });

  it('powinien zwrócić 400 dla nieznanego celu WFS', async () => {
    const req: any = { method: 'GET', query: { target: 'nieznany-cel' } };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.data.error).toMatch(/Nieznany cel WFS/);
  });

  it('powinien zwrócić 400 dla nieprawidłowych parametrów WFS (np. brak SERVICE=WFS)', async () => {
    const req: any = {
      method: 'GET',
      query: { target: 'egib', SERVICE: 'WMS', typeNames: 'ms:budynki' },
    };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.data.error).toMatch(/Nieprawidłowe parametry zapytania WFS/);
  });

  it('powinien zwrócić 400 dla niedozwolonej nazwy warstwy (typName spoza whitelisty)', async () => {
    const req: any = {
      method: 'GET',
      query: { target: 'egib', SERVICE: 'WFS', typeNames: 'ms:niedozwolona_warstwa' },
    };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.data.error).toMatch(/Nieprawidłowe parametry zapytania WFS/);
  });
});
