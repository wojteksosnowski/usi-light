import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { nanoid } from 'nanoid';
import { getRedisAndRatelimit, formatLicenseKey } from '../lib/serverRedis.js';
import type { LicenseRecord } from '../lib/serverRedis.js';

// Tryb zapoznawczy: darmowy klucz PRO na 7 dni, jedno kliknięcie, bez podawania danych.
// Limitowany rate-limitem per IP, by ograniczyć nadużycia w czasie promocji.
let cachedTrialRatelimit: Ratelimit | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
  }

  const { redis } = getRedisAndRatelimit();
  if (!redis) {
    return res.status(503).json({ error: 'Baza danych nie jest skonfigurowana.' });
  }

  if (!cachedTrialRatelimit) {
    cachedTrialRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '10 m'),
      analytics: true,
      prefix: 'ratelimit:usi_trial',
    });
  }

  try {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : Array.isArray(forwarded) ? forwarded[0] : req.socket?.remoteAddress) ||
      '127.0.0.1';

    const { success } = await cachedTrialRatelimit.limit(ip);
    if (!success) {
      return res.status(429).json({
        error: 'Osiągnięto limit generowania kluczy (maksymalnie 5 zapytań na 10 minut z tego adresu IP). Odczekaj chwilę.',
      });
    }

    const days = 7;
    const now = Date.now();
    const durationMs = days * 24 * 60 * 60 * 1000;
    const uniqueSuffix = nanoid(8);
    const licenseKey = formatLicenseKey(days, uniqueSuffix);

    const licenseRecord: LicenseRecord = {
      key: licenseKey,
      days,
      status: 'active',
      createdAt: now,
      activatedAt: now,
      expiresAt: now + durationMs,
      customerEmail: null,
      stripeSessionId: `trial-${uniqueSuffix}`,
    };

    // Przechowujemy aktywny klucz przez okres ważności + 30 dni bufora (37 dni)
    const ttlSeconds = (days + 30) * 24 * 60 * 60;
    await redis.set(`license:${licenseKey}`, JSON.stringify(licenseRecord), { ex: ttlSeconds });

    return res.status(200).json({
      licenseKey,
      days,
      status: 'active',
      activatedAt: now,
      expiresAt: now + durationMs,
      daysLeft: days,
    });
  } catch (err: any) {
    console.error('Błąd generowania klucza próbnego:', err);
    return res.status(500).json({ error: 'Wystąpił błąd podczas generowania klucza próbnego.' });
  }
}
