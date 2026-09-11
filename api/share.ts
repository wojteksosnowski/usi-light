import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { nanoid } from 'nanoid';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { LicenseRecord } from './lib/serverStripe.js';

// Czas ważności linku współdzielenia w zależności od poziomu dostępu:
// brak licencji (free) -> 7 dni, PRO 7-dniowe -> 14 dni, PRO 30-dniowe -> 30 dni
const FREE_TTL_SECONDS = 7 * 24 * 60 * 60;
const PRO_TTL_BY_LICENSE_DAYS: Record<number, number> = {
  7: 14 * 24 * 60 * 60,
  30: 30 * 24 * 60 * 60,
};

async function resolveShareTtlSeconds(redis: Redis, licenseKey: unknown): Promise<number> {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return FREE_TTL_SECONDS;
  }

  const sanitizedKey = licenseKey.trim().toUpperCase();

  // Wbudowany Master Dev Key dla środowisk lokalnych/testowych
  if (sanitizedKey === 'USI-DEV-MASTER-PRO' || sanitizedKey === 'USI-DEV-PRO-9999' || sanitizedKey === 'DEV-PRO') {
    return PRO_TTL_BY_LICENSE_DAYS[30];
  }

  try {
    const rawRecord = await redis.get<string | LicenseRecord>(`license:${sanitizedKey}`);
    if (!rawRecord) return FREE_TTL_SECONDS;

    const license: LicenseRecord = typeof rawRecord === 'string' ? JSON.parse(rawRecord) : rawRecord;
    const now = Date.now();
    const isActive = license.status === 'active' && !!license.expiresAt && now <= license.expiresAt;
    if (!isActive) return FREE_TTL_SECONDS;

    return PRO_TTL_BY_LICENSE_DAYS[license.days] ?? FREE_TTL_SECONDS;
  } catch (err) {
    console.warn('Nie udało się zweryfikować klucza licencyjnego przy udostępnianiu:', err);
    return FREE_TTL_SECONDS;
  }
}

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

      // 2. Pobranie i walidacja danych (E2EE: serwer widzi tylko IV + szyfrogram, nigdy klucz ani treść)
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { version, iv, ciphertext, licenseKey } = body || {};

      if (version !== 1 || typeof iv !== 'string' || typeof ciphertext !== 'string' || !iv || !ciphertext) {
        return res.status(400).json({ error: 'Nieprawidłowy format danych projektu.' });
      }

      // Limit wielkości: 256 KB w Base64 (po szyfrowaniu/kompresji to ogromna scena na kilkaset brył)
      if (iv.length + ciphertext.length > 256 * 1024) {
        return res.status(413).json({ error: 'Projekt przekracza maksymalny dopuszczalny rozmiar (256 KB po szyfrowaniu).' });
      }

      // 3. Zapis w Upstash Redis — TTL zależny od poziomu dostępu (nigdy nie ufamy TTL z klienta)
      const shareId = nanoid(10);
      const TTL_SECONDS = await resolveShareTtlSeconds(redis, licenseKey);

      const record = { version: 1, iv, ciphertext, createdAt: Date.now() };
      await redis.set(`project:${shareId}`, JSON.stringify(record), { ex: TTL_SECONDS });

      return res.status(200).json({
        shareId,
        url: `/p/${shareId}`,
        ttlDays: Math.round(TTL_SECONDS / (24 * 60 * 60)),
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
      const raw = await redis.get<string>(`project:${sanitizedId}`);

      if (!raw) {
        return res.status(404).json({
          error: 'Projekt wygasł lub nie istnieje. Poproś o nowy link udostępniania.',
        });
      }

      // Nowy format (E2EE): JSON { version, iv, ciphertext }. Format legacy (linki utworzone
      // przed wdrożeniem szyfrowania): surowy ciąg base64-gzip — nie parsuje się jako JSON.
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && parsed.iv && parsed.ciphertext) {
          return res.status(200).json({ version: 1, iv: parsed.iv, ciphertext: parsed.ciphertext });
        }
      } catch {
        // nie JSON -> format legacy, kontynuuj poniżej
      }

      return res.status(200).json({ compressedData: raw });
    } catch (err: any) {
      console.error('Błąd przy pobieraniu projektu z Redis:', err);
      return res.status(500).json({ error: 'Wystąpił błąd podczas odczytu projektu.' });
    }
  }

  return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
}
