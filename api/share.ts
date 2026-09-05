import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { nanoid } from 'nanoid';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Inicjalizacja klienta Upstash Redis ze zmiennych środowiskowych Vercela:
// UPSTASH_REDIS_REST_URL oraz UPSTASH_REDIS_REST_TOKEN
let cachedRedis: Redis | null = null;
let cachedRatelimit: Ratelimit | null = null;

function getRedisAndRatelimit() {
  if (cachedRedis) {
    return { redis: cachedRedis, ratelimit: cachedRatelimit };
  }
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      cachedRedis = Redis.fromEnv();
      cachedRatelimit = new Ratelimit({
        redis: cachedRedis,
        limiter: Ratelimit.slidingWindow(15, '1 h'),
        analytics: true,
        prefix: 'ratelimit:usi_share',
      });
      return { redis: cachedRedis, ratelimit: cachedRatelimit };
    } catch (err) {
      console.warn('Nie udało się zainicjalizować Upstash Redis:', err);
    }
  }
  return { redis: null, ratelimit: null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers dla zapytań z aplikacji
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
  }

  const { redis, ratelimit } = getRedisAndRatelimit();

  if (!redis) {
    return res.status(503).json({
      error: 'Baza Upstash Redis nie jest skonfigurowana. Ustaw UPSTASH_REDIS_REST_URL i UPSTASH_REDIS_REST_TOKEN w zmiennych środowiskowych Vercel.',
    });
  }

  // Obsługa POST - Tworzenie linku do udostępnienia
  if (req.method === 'POST') {
    try {
      // 1. Rate Limiting per IP
      const forwarded = req.headers['x-forwarded-for'];
      const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : Array.isArray(forwarded) ? forwarded[0] : req.socket?.remoteAddress) || '127.0.0.1';

      if (ratelimit) {
        const { success } = await ratelimit.limit(ip);
        if (!success) {
          return res.status(429).json({
            error: 'Zbyt wiele zapytań z tego adresu IP. Limit wynosi 15 udostępnień na godzinę.',
          });
        }
      }

      // 2. Pobranie i walidacja danych
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { compressedData } = body || {};

      if (!compressedData || typeof compressedData !== 'string') {
        return res.status(400).json({ error: 'Nieprawidłowy format danych projektu.' });
      }

      // Limit wielkości: 256 KB w Base64 (po kompresji to ogromna scena na kilkaset brył)
      if (compressedData.length > 256 * 1024) {
        return res.status(413).json({ error: 'Projekt przekracza maksymalny dopuszczalny rozmiar (256 KB).' });
      }

      // 3. Zapis w Upstash Redis
      const shareId = nanoid(10);
      const TTL_SECONDS = 14 * 24 * 60 * 60; // 14 dni (dokładnie 1 209 600 sekund)

      await redis.set(`project:${shareId}`, compressedData, { ex: TTL_SECONDS });

      return res.status(200).json({
        shareId,
        url: `/p/${shareId}`,
      });
    } catch (err: any) {
      console.error('Błąd przy zapisie projektu do Redis:', err);
      return res.status(500).json({ error: 'Wystąpił błąd podczas generowania linku udostępniania.' });
    }
  }

  // Obsługa GET - Pobieranie projektu po ID
  if (req.method === 'GET') {
    try {
      const id = req.query.id as string;
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        return res.status(400).json({ error: 'Brak identyfikatora projektu w zapytaniu.' });
      }

      const sanitizedId = id.trim();
      const compressedData = await redis.get<string>(`project:${sanitizedId}`);

      if (!compressedData) {
        return res.status(404).json({
          error: 'Projekt wygasł lub nie istnieje. Linki udostępniania są aktywne przez 14 dni.',
        });
      }

      return res.status(200).json({ compressedData });
    } catch (err: any) {
      console.error('Błąd przy pobieraniu projektu z Redis:', err);
      return res.status(500).json({ error: 'Wystąpił błąd podczas odczytu projektu.' });
    }
  }

  return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
}
