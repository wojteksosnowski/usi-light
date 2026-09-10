import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Singleton Upstash Redis Client
let cachedRedis: Redis | null = null;
let cachedRatelimit: Ratelimit | null = null;

export function getRedisAndRatelimit() {
  if (cachedRedis) {
    return { redis: cachedRedis, ratelimit: cachedRatelimit };
  }
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      cachedRedis = Redis.fromEnv();
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
