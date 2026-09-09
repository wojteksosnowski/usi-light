import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from './share';

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRatelimitLimit = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({
      get: mockRedisGet,
      set: mockRedisSet,
    }),
  },
}));

vi.mock('@upstash/ratelimit', () => {
  return {
    Ratelimit: class MockRatelimit {
      static slidingWindow = vi.fn();
      limit = mockRatelimitLimit;
    },
  };
});

describe('Vercel Serverless Function /api/share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';
    mockRatelimitLimit.mockResolvedValue({ success: true });
  });

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
      end: vi.fn(),
    };
    return res;
  };

  it('powinien obsłużyć zapytanie OPTIONS (CORS preflight)', async () => {
    const req: any = { method: 'OPTIONS', headers: {} };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.end).toHaveBeenCalled();
  });

  it('powinien obsłużyć błąd 405 dla niedozwolonych metod HTTP (np. DELETE)', async () => {
    const req: any = { method: 'DELETE', headers: {} };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.data.error).toBeDefined();
  });

  describe('POST /api/share', () => {
    it('powinien zwrócić 400 gdy body nie zawiera version/iv/ciphertext', async () => {
      const req: any = { method: 'POST', headers: {}, body: {} };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toMatch(/Nieprawidłowy format/);
    });

    it('powinien zwrócić 413 gdy iv+ciphertext przekracza 256 KB', async () => {
      const hugeString = 'a'.repeat(257 * 1024);
      const req: any = { method: 'POST', headers: {}, body: { version: 1, iv: 'abc', ciphertext: hugeString } };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(413);
      expect(res.data.error).toMatch(/maksymalny dopuszczalny rozmiar/);
    });

    it('powinien zwrócić 429 gdy przekroczono limit zapytań (Rate Limit)', async () => {
      mockRatelimitLimit.mockResolvedValueOnce({ success: false });
      const req: any = {
        method: 'POST',
        headers: { 'x-forwarded-for': '192.168.1.1' },
        body: { version: 1, iv: 'abc', ciphertext: 'valid-ciphertext-data' },
      };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(429);
      expect(res.data.error).toMatch(/Zbyt wiele zapytań/);
    });

    it('powinien zapisać zaszyfrowany projekt do Redis z TTL 7 dni (free) i zwrócić shareId', async () => {
      mockRedisSet.mockResolvedValueOnce('OK');
      const req: any = {
        method: 'POST',
        headers: {},
        body: { version: 1, iv: 'ivBase64Url', ciphertext: 'H4sICCAAAAAAA...' },
      };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.data.shareId).toBeDefined();
      expect(res.data.url).toMatch(/^\/p\//);
      expect(res.data.ttlDays).toBe(7);
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringMatching(/^project:/),
        expect.stringContaining('"ciphertext":"H4sICCAAAAAAA..."'),
        { ex: 604800 }
      );
      // Serwer nigdy nie widzi/przechowuje klucza deszyfrującego — tylko IV + szyfrogram.
      const storedRecord = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(storedRecord).toEqual({ version: 1, iv: 'ivBase64Url', ciphertext: 'H4sICCAAAAAAA...', createdAt: expect.any(Number) });
    });
  });

  describe('GET /api/share', () => {
    it('powinien zwrócić 400 gdy brak parametru id', async () => {
      const req: any = { method: 'GET', headers: {}, query: {} };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(400);
    });

    it('powinien zwrócić 404 gdy projekt wygasł lub nie istnieje', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      const req: any = { method: 'GET', headers: {}, query: { id: 'non-existing-id' } };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(404);
      expect(res.data.error).toMatch(/wygasł lub nie istnieje/);
    });

    it('powinien zwrócić { version, iv, ciphertext } dla nowego (zaszyfrowanego) rekordu', async () => {
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({ version: 1, iv: 'ivBase64Url', ciphertext: 'cipherBase64Url', createdAt: 123 })
      );
      const req: any = { method: 'GET', headers: {}, query: { id: 'test123456' } };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.data).toEqual({ version: 1, iv: 'ivBase64Url', ciphertext: 'cipherBase64Url' });
      expect(mockRedisGet).toHaveBeenCalledWith('project:test123456');
    });

    it('powinien zwrócić { compressedData } dla starszego (niezaszyfrowanego) rekordu (format legacy)', async () => {
      mockRedisGet.mockResolvedValueOnce('compressed-payload-string');
      const req: any = { method: 'GET', headers: {}, query: { id: 'oldid123' } };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.data.compressedData).toBe('compressed-payload-string');
    });
  });
});
