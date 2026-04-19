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
 * Rate limiter for authentication endpoints (/login, /register, /refresh).
 * Backed by Redis so the limit is shared across all pods.
 */
export const authRateLimiter = rateLimit({
  windowMs: authConfig.rateLimit.windowMs,
  max: authConfig.rateLimit.maxRequests,
  store: new RedisRateLimitStore(authConfig.rateLimit.windowMs),
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

const strictWindowMs = 60 * 60 * 1000; // 1 hour

/**
 * Stricter rate limiter for sensitive operations (password reset, change-password, etc.)
 * Redis-backed so the 3-per-hour limit is shared across all pods.
 */
export const strictRateLimiter = rateLimit({
  windowMs: strictWindowMs,
  max: 3,
  store: new RedisRateLimitStore(strictWindowMs),
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

const aiOracleWindowMs = 60 * 60 * 1000; // 1 hour

/**
 * Rate limiter for high-cost oracle-style AI calls (appliance oracle, budget forecaster).
 * Redis-backed so the 5-per-hour limit is shared across all pods.
 */
export const aiOracleRateLimiter = rateLimit({
  windowMs: aiOracleWindowMs,
  max: 5,
  keyGenerator: rateLimitKey,
  store: new RedisRateLimitStore(aiOracleWindowMs),
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

const geminiWindowMs = 60 * 60 * 1000; // 1 hour

/**
 * Rate limiter for Gemini chat — conversational AI, moderate cost.
 * 30 messages per user per hour across all pods.
 */
export const geminiRateLimiter = rateLimit({
  windowMs: geminiWindowMs,
  max: 30,
  keyGenerator: rateLimitKey,
  store: new RedisRateLimitStore(geminiWindowMs),
  message: {
    success: false,
    error: {
      message: 'Too many AI chat requests. Limit is 30 per hour.',
      code: 'AI_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const expensiveAiWindowMs = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Rate limiter for high-cost AI endpoints that process images or generate
 * full reports (energy auditor, visual inspector).
 * 10 requests per user per day across all pods.
 */
export const expensiveAiRateLimiter = rateLimit({
  windowMs: expensiveAiWindowMs,
  max: 10,
  keyGenerator: rateLimitKey,
  store: new RedisRateLimitStore(expensiveAiWindowMs),
  message: {
    success: false,
    error: {
      message: 'Daily limit reached for AI analysis. Limit is 10 per day.',
      code: 'AI_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadWindowMs = 60 * 1000; // 1 minute

/**
 * Rate limiter for the document upload + AI analyze endpoint.
 *
 * Must be applied AFTER authenticate (so the key is user-based) but BEFORE
 * multer (so rejected requests never buffer file bytes into heap memory).
 * This bounds the worst-case concurrent heap allocation from this route:
 * 10 req/min × 10 MB = 100 MB maximum in-flight per authenticated user.
 */
export const uploadRateLimiter = rateLimit({
  windowMs: uploadWindowMs,
  max: 10,
  keyGenerator: rateLimitKey,
  store: new RedisRateLimitStore(uploadWindowMs),
  message: {
    success: false,
    error: {
      message: 'Too many file uploads. Limit is 10 per minute.',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const ocrWindowMs = 60 * 1000; // 1 minute
const ocrMaxPerMinute = Number(process.env.OCR_MAX_PER_MINUTE || 6);

function ocrRateLimitKey(req: Request): string {
  const propertyId = typeof req.params?.propertyId === 'string' ? req.params.propertyId : 'unknown';
  return `${rateLimitKey(req)}:property:${propertyId}:ocr`;
}

/**
 * OCR limiter for inventory label extraction.
 * Redis-backed to keep limits consistent across pods and restarts.
 */
export const ocrRateLimiter = rateLimit({
  windowMs: ocrWindowMs,
  max: ocrMaxPerMinute,
  keyGenerator: ocrRateLimitKey,
  store: new RedisRateLimitStore(ocrWindowMs),
  message: {
    success: false,
    error: {
      message: 'OCR rate limit reached. Please try again shortly.',
      code: 'OCR_RATE_LIMITED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
