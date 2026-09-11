import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStripe, getRedisAndRatelimit } from '../lib/serverStripe.js';

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

  try {
    const { ratelimit } = getRedisAndRatelimit();
    if (ratelimit) {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : Array.isArray(forwarded) ? forwarded[0] : req.socket?.remoteAddress) || '127.0.0.1';
      const { success } = await ratelimit.limit(`checkout:${ip}`);
      if (!success) {
        return res.status(429).json({ error: 'Zbyt wiele prób utworzenia sesji płatności. Spróbuj ponownie za chwilę.' });
      }
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { plan } = body || {};

    if (plan !== '7d' && plan !== '30d') {
      return res.status(400).json({ error: 'Nieprawidłowy pakiet. Wybierz "7d" lub "30d".' });
    }

    const priceId = plan === '7d'
      ? (process.env.STRIPE_PRICE_7D || 'price_1UCTGARpte4YnjWcKSdg1Evz')
      : (process.env.STRIPE_PRICE_30D || 'price_1UCTH7Rpte4YnjWcJk86t4gC');

    const stripe = getStripe();

    // Wyznaczenie adresu powrotnego (origin)
    const origin = req.headers.origin || req.headers.referer
      ? new URL(req.headers.origin || req.headers.referer as string).origin
      : 'https://usi-light.vercel.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'blik', 'p24'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        plan,
        days: plan === '7d' ? '7' : '30',
      },
      success_url: `${origin}/?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?payment_cancelled=true`,
    });

    if (!session.url) {
      return res.status(500).json({ error: 'Nie udało się utworzyć adresu sesji Stripe.' });
    }

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('Błąd podczas tworzenia sesji Stripe Checkout:', err);
    return res.status(500).json({ error: err.message || 'Wystąpił błąd podczas inicjalizacji płatności.' });
  }
}
