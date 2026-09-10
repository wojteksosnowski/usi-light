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
      limiter: Ratelimit.slidingWindow(1, '24 h'),
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
        error: 'Bezpłatny klucz na 7 dni można wygenerować raz na 24 godziny z tego adresu IP.',
      });
    }

    const days = 7;
    const uniqueSuffix = nanoid(8);
    const licenseKey = formatLicenseKey(days, uniqueSuffix);

    const licenseRecord: LicenseRecord = {
      key: licenseKey,
      days,
      status: 'unactivated',
      createdAt: Date.now(),
      activatedAt: null,
      expiresAt: null,
      customerEmail: null,
      stripeSessionId: `trial-${uniqueSuffix}`,
    };

    const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
    await redis.set(`license:${licenseKey}`, JSON.stringify(licenseRecord), { ex: ONE_YEAR_SECONDS });

    return res.status(200).json({ licenseKey, days });
  } catch (err: any) {
    console.error('Błąd generowania klucza próbnego:', err);
    return res.status(500).json({ error: 'Wystąpił błąd podczas generowania klucza próbnego.' });
  }
}
