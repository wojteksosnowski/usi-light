import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedisAndRatelimit, LicenseRecord } from '../lib/serverStripe';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Niedozwolona metoda HTTP.' });
  }

  const { redis, ratelimit } = getRedisAndRatelimit();
  if (!redis) {
    return res.status(503).json({ error: 'Baza danych nie jest skonfigurowana.' });
  }

  try {
    if (ratelimit) {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : Array.isArray(forwarded) ? forwarded[0] : req.socket?.remoteAddress) || '127.0.0.1';
      const { success } = await ratelimit.limit(`activate:${ip}`);
      if (!success) {
        return res.status(429).json({ error: 'Zbyt wiele prób aktywacji klucza. Odczekaj chwilę.' });
      }
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const rawKey = body?.licenseKey;

    if (!rawKey || typeof rawKey !== 'string') {
      return res.status(400).json({ error: 'Proszę podać klucz licencyjny.' });
    }

    const sanitizedKey = rawKey.trim().toUpperCase();

    // Wbudowany Master Dev Key dla środowisk lokalnych/testowych
    if (sanitizedKey === 'USI-DEV-MASTER-PRO' || sanitizedKey === 'USI-DEV-PRO-9999' || sanitizedKey === 'DEV-PRO') {
      const now = Date.now();
      const durationMs = 9999 * 24 * 60 * 60 * 1000;
      return res.status(200).json({
        success: true,
        message: 'Master Dev Key został aktywowany (Tryb Deweloperski Unlimited)!',
        licenseKey: sanitizedKey,
        status: 'active',
        days: 9999,
        daysLeft: 9999,
        activatedAt: now,
        expiresAt: now + durationMs,
      });
    }

    const rawRecord = await redis.get<string | LicenseRecord>(`license:${sanitizedKey}`);

    if (!rawRecord) {
      return res.status(404).json({
        error: 'Nie znaleziono podanego klucza licencyjnego. Upewnij się, że wpisany kod jest poprawny.',
      });
    }

    const license: LicenseRecord = typeof rawRecord === 'string' ? JSON.parse(rawRecord) : rawRecord;
    const now = Date.now();

    // Scenariusz 1: Pierwsza aktywacja klucza
    if (license.status === 'unactivated') {
      const durationMs = license.days * 24 * 60 * 60 * 1000;
      license.status = 'active';
      license.activatedAt = now;
      license.expiresAt = now + durationMs;

      // Zapisujemy zaktualizowany rekord w Redis z TTL = czas ważności + 30 dni bufora
      const ttlSeconds = (license.days + 30) * 24 * 60 * 60;
      await redis.set(`license:${sanitizedKey}`, JSON.stringify(license), { ex: ttlSeconds });

      const daysLeft = Math.ceil((license.expiresAt - now) / (1000 * 60 * 60 * 24));

      return res.status(200).json({
        success: true,
        message: `Klucz został pomyślnie aktywowany na okres ${license.days} dni!`,
        licenseKey: license.key,
        status: 'active',
        days: license.days,
        daysLeft,
        activatedAt: license.activatedAt,
        expiresAt: license.expiresAt,
      });
    }

    // Scenariusz 2: Klucz już był aktywowany
    if (license.status === 'active' && license.expiresAt) {
      if (now <= license.expiresAt) {
        const daysLeft = Math.max(1, Math.ceil((license.expiresAt - now) / (1000 * 60 * 60 * 24)));
        return res.status(200).json({
          success: true,
          message: 'Klucz jest aktywny.',
          licenseKey: license.key,
          status: 'active',
          days: license.days,
          daysLeft,
          activatedAt: license.activatedAt,
          expiresAt: license.expiresAt,
        });
      } else {
        license.status = 'expired';
        await redis.set(`license:${sanitizedKey}`, JSON.stringify(license));
        return res.status(400).json({
          error: `Ten klucz licencyjny wygasł w dniu ${new Date(license.expiresAt).toLocaleDateString('pl-PL')}.`,
          status: 'expired',
          expiresAt: license.expiresAt,
        });
      }
    }

    return res.status(400).json({ error: 'Klucz licencyjny jest nieaktywny lub wygasł.' });
  } catch (err: any) {
    console.error('Błąd podczas aktywacji licencji:', err);
    return res.status(500).json({ error: 'Wystąpił błąd podczas aktywacji klucza licencyjnego.' });
  }
}
