import rateLimit, { ipKeyGenerator, Store, ClientRateLimitInfo } from 'express-rate-limit';
import type { Request } from 'express';
import { authConfig } from '../config/jwt.config';
import { verifyAccessToken } from '../utils/jwt.util';
import { redis } from '../lib/redis';

/**
 * Redis-backed rate-limit store.
 *
 * Uses an atomic Lua script (INCR + PEXPIRE in one round-trip) so the
 * sliding window works correctly across all backend pods, replacing the
 * per-pod MemoryStore that effectively multiplied the limit by replica count.
 *
 * Falls open on Redis errors so a Redis outage never blocks legitimate traffic.
 */
class RedisRateLimitStore implements Store {
  private readonly windowMs: number;
  // localKeys: false tells express-rate-limit this store is shared across instances
  // (pods), so it suppresses the false-positive double-count warning.
  readonly localKeys = false;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  private redisKey(key: string): string {
    return `rl:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const rKey = this.redisKey(key);
    try {
      // Atomic: increment; on first touch, set the expiry for the window.
      const script = `
        local n = redis.call('INCR', KEYS[1])
        if n == 1 then
          redis.call('PEXPIRE', KEYS[1], ARGV[1])
        end
        local ttl = redis.call('PTTL', KEYS[1])
        return {n, ttl}
      `;
      const result = (await redis.eval(script, 1, rKey, String(this.windowMs))) as [number, number];
      const [totalHits, ttlMs] = result;
      return {
        totalHits,
        resetTime: new Date(Date.now() + (ttlMs > 0 ? ttlMs : this.windowMs)),
      };
    } catch {
      // Fail open: treat as 0 hits so the request is never blocked by Redis errors.
      return { totalHits: 0, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await redis.decr(this.redisKey(key));
    } catch { /* ignore */ }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await redis.del(this.redisKey(key));
    } catch { /* ignore */ }
  }
}

function bearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function rateLimitKey(req: Request): string {
  const token = bearerToken(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      if (payload.userId) return `user:${payload.userId}`;
    } catch {
      // Invalid/expired token: fall back to IP key.
    }
  }
  return `ip:${ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? 'unknown')}`;
}

const apiWindowMs = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const apiMaxRequests = Number(process.env.API_RATE_LIMIT_MAX || 2000);

/**
 * Rate limiter for authentication endpoints
 */
export const authRateLimiter = rateLimit({
  windowMs: authConfig.rateLimit.windowMs,
  max: authConfig.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter rate limiter for sensitive operations
 */
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    error: {
      message: 'Too many attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API rate limiter — backed by Redis so the limit is shared across
 * all backend pods (replacing the per-pod MemoryStore).
 */
export const apiRateLimiter = rateLimit({
  windowMs: apiWindowMs,
  max: apiMaxRequests,
  keyGenerator: rateLimitKey,
  skip: (req) => req.method === 'OPTIONS',
  store: new RedisRateLimitStore(apiWindowMs),
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const aiOracleRateLimiter = rateLimit({ // <-- NEW EXPORT
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 requests per hour per IP for high-cost calls
  message: {
    success: false,
    error: {
      message: 'Too many high-cost AI requests. Limit is 5 per hour.',
      code: 'AI_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
