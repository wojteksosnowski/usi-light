import Stripe from 'stripe';

// Singleton Stripe Client
let cachedStripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Brak zdefiniowanego STRIPE_SECRET_KEY w zmiennych środowiskowych.');
  }
  cachedStripe = new Stripe(secretKey, {
    apiVersion: '2026-03-04' as any,
  });
  return cachedStripe;
}

export { getRedisAndRatelimit, formatLicenseKey } from './serverRedis';
export type { LicenseRecord } from './serverRedis';
