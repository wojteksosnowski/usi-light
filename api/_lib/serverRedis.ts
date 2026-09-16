import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Singleton Upstash Redis Client
let cachedRedis: Redis | null = null;
let cachedRatelimit: Ratelimit | null = null;

export function getRedisAndRatelimit() {
  if (cachedRedis) {
    return { redis: cachedRedis, ratelimit: cachedRatelimit };
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      cachedRedis = new Redis({ url, token });
      cachedRatelimit = new Ratelimit({
        redis: cachedRedis,
        limiter: Ratelimit.slidingWindow(30, '1 h'),
        analytics: true,
        prefix: 'ratelimit:usi_license',
      });
      return { redis: cachedRedis, ratelimit: cachedRatelimit };
    } catch (err) {
      console.warn('Nie udało się zainicjalizować Upstash Redis:', err);
    }
  }
  return { redis: null, ratelimit: null };
}

// Format klucza licencyjnego: USI-30D-XXXX-XXXX
export function formatLicenseKey(days: number, rawId: string): string {
  const cleanId = rawId.toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(8, '0').slice(0, 8);
  const part1 = cleanId.slice(0, 4);
  const part2 = cleanId.slice(4, 8);
  return `USI-${days}D-${part1}-${part2}`;
}

export interface LicenseRecord {
  key: string;
  days: number;
  status: 'unactivated' | 'active' | 'expired';
  createdAt: number;
  activatedAt: number | null;
  expiresAt: number | null;
  customerEmail: string | null;
  stripeSessionId: string;
}

export interface OfflineLicenseResolution {
  licenseKey: string;
  days: number;
  daysLeft: number;
  activatedAt: number;
  expiresAt: number;
}

const MASTER_DEV_KEYS = new Set(['USI-DEV-MASTER-PRO', 'USI-DEV-PRO-9999', 'DEV-PRO']);

// Wbudowany Master Dev Key dla środowisk lokalnych/testowych — działa niezależnie od Redis.
export function resolveMasterDevKey(sanitizedKey: string): OfflineLicenseResolution | null {
  if (!MASTER_DEV_KEYS.has(sanitizedKey)) return null;
  const days = 9999;
  const now = Date.now();
  return { licenseKey: sanitizedKey, days, daysLeft: days, activatedAt: now, expiresAt: now + days * 24 * 60 * 60 * 1000 };
}

// Fallback gdy Redis nie jest skonfigurowany: klucz w formacie USI-{days}D-... jest akceptowany bez zapisu stanu.
export function resolveLocalFallbackLicense(sanitizedKey: string): OfflineLicenseResolution | null {
  if (!sanitizedKey.startsWith('USI-') || sanitizedKey.length < 14) return null;
  const dMatch = sanitizedKey.match(/^USI-(\d+)D/);
  const days = dMatch ? parseInt(dMatch[1], 10) : 7;
  const now = Date.now();
  return { licenseKey: sanitizedKey, days, daysLeft: days, activatedAt: now, expiresAt: now + days * 24 * 60 * 60 * 1000 };
}
