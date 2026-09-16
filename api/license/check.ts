import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedisAndRatelimit, resolveMasterDevKey, resolveLocalFallbackLicense } from '../_lib/serverRedis';
import type { LicenseRecord } from '../_lib/serverRedis';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
  }

  const rawKey = req.query.key as string;
  if (!rawKey || typeof rawKey !== 'string') {
    return res.status(400).json({ error: 'Brak klucza licencyjnego w zapytaniu.' });
  }

  const sanitizedKey = rawKey.trim().toUpperCase();

  const masterKey = resolveMasterDevKey(sanitizedKey);
  if (masterKey) {
    return res.status(200).json({
      valid: true,
      status: 'active',
      licenseKey: masterKey.licenseKey,
      days: masterKey.days,
      daysLeft: masterKey.daysLeft,
      activatedAt: masterKey.activatedAt,
      expiresAt: masterKey.expiresAt,
    });
  }

  const { redis } = getRedisAndRatelimit();
  if (!redis) {
    const fallback = resolveLocalFallbackLicense(sanitizedKey);
    if (fallback) {
      return res.status(200).json({
        valid: true,
        status: 'active',
        licenseKey: fallback.licenseKey,
        days: fallback.days,
        daysLeft: fallback.daysLeft,
        activatedAt: fallback.activatedAt,
        expiresAt: fallback.expiresAt,
      });
    }
    return res.status(503).json({ error: 'Baza danych nie jest skonfigurowana.' });
  }

  try {
    const rawRecord = await redis.get<string | LicenseRecord>(`license:${sanitizedKey}`);

    if (!rawRecord) {
      return res.status(404).json({ error: 'Nie znaleziono klucza licencyjnego.', valid: false });
    }

    const license: LicenseRecord = typeof rawRecord === 'string' ? JSON.parse(rawRecord) : rawRecord;
    const now = Date.now();

    if (license.status === 'unactivated') {
      return res.status(200).json({
        valid: true,
        status: 'unactivated',
        licenseKey: license.key,
        days: license.days,
        message: 'Klucz jest gotowy do aktywacji.',
      });
    }

    if (license.status === 'active' && license.expiresAt) {
      if (now <= license.expiresAt) {
        const daysLeft = Math.max(1, Math.ceil((license.expiresAt - now) / (1000 * 60 * 60 * 24)));
        return res.status(200).json({
          valid: true,
          status: 'active',
          licenseKey: license.key,
          days: license.days,
          daysLeft,
          activatedAt: license.activatedAt,
          expiresAt: license.expiresAt,
        });
      } else {
        return res.status(200).json({
          valid: false,
          status: 'expired',
          licenseKey: license.key,
          days: license.days,
          expiresAt: license.expiresAt,
          message: 'Klucz wygasł.',
        });
      }
    }

    return res.status(200).json({
      valid: false,
      status: license.status,
      licenseKey: license.key,
    });
  } catch (err: any) {
    console.error('Błąd sprawdzania licencji:', err);
    return res.status(500).json({ error: 'Wystąpił błąd podczas sprawdzania statusu klucza.' });
  }
}
