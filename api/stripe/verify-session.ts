import type { VercelRequest, VercelResponse } from '@vercel/node';
import { nanoid } from 'nanoid';
import { getStripe, getRedisAndRatelimit, formatLicenseKey, LicenseRecord } from '../lib/serverStripe.js';

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

  const sessionId = req.query.session_id as string;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return res.status(400).json({ error: 'Brak session_id w zapytaniu.' });
  }

  const { redis } = getRedisAndRatelimit();
  if (!redis) {
    return res.status(503).json({ error: 'Baza danych nie jest skonfigurowana.' });
  }

  try {
    // 1. Sprawdzenie, czy klucz został już utworzony przez webhook
    const existingKey = await redis.get<string>(`stripe_session:${sessionId}`);
    if (existingKey) {
      const rawData = await redis.get<string | LicenseRecord>(`license:${existingKey}`);
      const license: LicenseRecord = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      return res.status(200).json({
        success: true,
        licenseKey: license.key,
        days: license.days,
        status: license.status,
        expiresAt: license.expiresAt,
        customerEmail: license.customerEmail,
      });
    }

    // 2. Jeśli webhook jeszcze nie dotarł, weryfikujemy sesję bezpośrednio w Stripe
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Płatność za tę sesję nie została jeszcze zakończona lub została anulowana.',
      });
    }

    const days = parseInt(session.metadata?.days || '30', 10);
    const customerEmail = session.customer_details?.email || session.customer_email || null;

    // Generujemy klucz
    const uniqueSuffix = nanoid(8);
    const licenseKey = formatLicenseKey(days, uniqueSuffix);

    const licenseRecord: LicenseRecord = {
      key: licenseKey,
      days,
      status: 'unactivated',
      createdAt: Date.now(),
      activatedAt: null,
      expiresAt: null,
      customerEmail,
      stripeSessionId: sessionId,
    };

    const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
    await redis.set(`license:${licenseKey}`, JSON.stringify(licenseRecord), { ex: ONE_YEAR_SECONDS });
    await redis.set(`stripe_session:${sessionId}`, licenseKey, { ex: ONE_YEAR_SECONDS });

    return res.status(200).json({
      success: true,
      licenseKey,
      days,
      status: 'unactivated',
      expiresAt: null,
      customerEmail,
    });
  } catch (err: any) {
    console.error('Błąd weryfikacji sesji płatności:', err);
    return res.status(500).json({ error: err.message || 'Wystąpił błąd podczas weryfikacji sesji płatności.' });
  }
}
