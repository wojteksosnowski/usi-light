import type { VercelRequest, VercelResponse } from '@vercel/node';
import { nanoid } from 'nanoid';
import { getStripe, getRedisAndRatelimit, formatLicenseKey, LicenseRecord } from '../lib/serverStripe';

// Helper do pobierania surowego bufora żądania dla weryfikacji podpisu Stripe
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf-8');
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error('Brak podpisu Stripe lub STRIPE_WEBHOOK_SECRET.');
    return res.status(400).send('Webhook Secret or Signature missing');
  }

  let event: any;
  const stripe = getStripe();

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Błąd weryfikacji podpisu webhooka Stripe: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Obsługa opłacenia sesji
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const { redis } = getRedisAndRatelimit();

    if (!redis) {
      console.error('Redis nie jest skonfigurowany w webhooku.');
      return res.status(500).send('Redis connection error');
    }

    try {
      const sessionId = session.id;
      const plan = session.metadata?.plan || '30d';
      const days = parseInt(session.metadata?.days || '30', 10);
      const customerEmail = session.customer_details?.email || session.customer_email || null;

      // Sprawdzenie, czy klucz dla tej sesji już istnieje (idempotentność)
      const existingKey = await redis.get<string>(`stripe_session:${sessionId}`);
      if (existingKey) {
        console.log(`Klucz dla sesji ${sessionId} już istnieje: ${existingKey}`);
        return res.status(200).json({ received: true, key: existingKey });
      }

      // Generowanie unikalnego klucza licencyjnego
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

      // Zapisujemy klucz w Redis bez terminu wygaśnięcia przed aktywacją (lub długi TTL 1 rok)
      const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
      await redis.set(`license:${licenseKey}`, JSON.stringify(licenseRecord), { ex: ONE_YEAR_SECONDS });
      await redis.set(`stripe_session:${sessionId}`, licenseKey, { ex: ONE_YEAR_SECONDS });

      console.log(`Pomyślnie wygenerowano klucz ${licenseKey} dla sesji ${sessionId} (${customerEmail || 'brak e-mail'})`);
      return res.status(200).json({ received: true, key: licenseKey });
    } catch (err: any) {
      console.error('Błąd zapisu licencji do Redis w webhooku:', err);
      return res.status(500).send('Database storage error');
    }
  }

  return res.status(200).json({ received: true });
}
