import rateLimit, { ipKeyGenerator, Store, ClientRateLimitInfo } from 'express-rate-limit';
import type { Request } from 'express';
import { createHash } from 'crypto';
import { authConfig } from '../config/jwt.config';
import { verifyAccessToken } from '../utils/jwt.util';
import { getAccessTokenFromRequest } from '../utils/authCookies.util';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

/**
 * Redis-backed rate-limit store.
 *
 * Uses an atomic Lua script (INCR + PEXPIRE in one round-trip) so the
 * sliding window works correctly across all backend pods, replacing the
 * per-pod MemoryStore that effectively multiplied the limit by replica count.
 *
 * Falls back to a local in-process counter on Redis errors so a Redis outage
 * does not silently disable brute-force protection across all pods.
 */
class RedisRateLimitStore implements Store {
  private readonly namespace: string;
  private readonly windowMs: number;
  private readonly fallback = new Map<string, { hits: number; resetAt: number }>();
  private redisHealthy = true;
  // localKeys: false tells express-rate-limit this store is shared across instances
  // (pods), so it suppresses the false-positive double-count warning.
  readonly localKeys = false;

  constructor(namespace: string, windowMs: number) {
    if (!/^[a-z0-9-]+$/.test(namespace)) {
      throw new Error(`Invalid rate-limit namespace: ${namespace}`);
    }
    this.namespace = namespace;
    this.windowMs = windowMs;
  }

  private redisKey(key: string): string {
    // Each policy must own an independent bucket. Without this namespace,
    // ordinary API traffic and specialist limits (for example Gemini chat)
    // increment the same Redis key for a user and contaminate each other.
    return `rl:${this.namespace}:${key}`;
  }

  private incrementFallback(rKey: string): ClientRateLimitInfo {
    const now = Date.now();
    const existing = this.fallback.get(rKey);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.fallback.set(rKey, { hits: 1, resetAt });
      return { totalHits: 1, resetTime: new Date(resetAt) };
    }

    existing.hits += 1;
    return {
      totalHits: existing.hits,
      resetTime: new Date(existing.resetAt),
    };
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
      if (!this.redisHealthy) {
        logger.warn({ key: rKey }, '[RATE_LIMIT] Redis recovered; disabling in-process fallback');
      }
      this.redisHealthy = true;
      this.fallback.delete(rKey);
      return {
        totalHits,
        resetTime: new Date(Date.now() + (ttlMs > 0 ? ttlMs : this.windowMs)),
      };
    } catch (error) {
      if (this.redisHealthy) {
        logger.error({ err: error }, '[RATE_LIMIT] Redis unavailable; using in-process fallback counters');
      }
      this.redisHealthy = false;
      return this.incrementFallback(rKey);
    }
  }

  async decrement(key: string): Promise<void> {
    const rKey = this.redisKey(key);
    try {
      await redis.decr(rKey);
    } catch { /* ignore */ }

    const fallbackEntry = this.fallback.get(rKey);
    if (fallbackEntry) {
      fallbackEntry.hits = Math.max(0, fallbackEntry.hits - 1);
      if (fallbackEntry.hits === 0) {
        this.fallback.delete(rKey);
      }
    }
  }

  async resetKey(key: string): Promise<void> {
    const rKey = this.redisKey(key);
    try {
      await redis.del(rKey);
    } catch { /* ignore */ }
    this.fallback.delete(rKey);
  }
}

function rateLimitKey(req: Request): string {
  const token = getAccessTokenFromRequest(req);
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

function getPathAtApiBoundary(req: Request): string {
  return (req.path || '').toLowerCase();
}

function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function hashTokenForRateLimit(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 24);
}

function propertyScopedIpKey(req: Request, suffix: string): string {
  const propertyId = typeof req.params?.propertyId === 'string' ? req.params.propertyId : 'unknown';
  const ip = ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? 'unknown');
  return `${suffix}:property:${propertyId}:ip:${ip}`;
}

function authRateLimitKey(req: Request): string {
  const path = getPathAtApiBoundary(req);
  const ipKey = `ip:${ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? 'unknown')}`;
  const body = req.body as Record<string, unknown> | undefined;

  // Key login/register attempts by account identity to avoid shared-IP lockouts.
  if (path === '/login' || path === '/register') {
    const email = normalizeEmail(body?.email);
    if (email) return `auth:${path}:email:${email}`;
  }

  // Key refresh attempts by refresh-session identity, not raw IP.
  const refreshToken =
    (typeof body?.refreshToken === 'string' && body.refreshToken.length > 0
      ? body.refreshToken
      : req.cookies?.['__Secure-ctc.rt'] ||
        req.cookies?.['__Host-ctc.rt'] ||
        req.cookies?.['ctc.rt']) || null;
  if (path === '/refresh' && refreshToken) {
    return `auth:${path}:rt:${hashTokenForRateLimit(refreshToken)}`;
  }

  return `auth:${path}:${ipKey}`;
}

const apiWindowMs = Number(
  process.env.API_RATE_LIMIT_WINDOW_MS ||
  process.env.RATE_LIMIT_WINDOW_MS ||
  15 * 60 * 1000
);
const apiMaxRequests = Number(
  process.env.API_RATE_LIMIT_MAX ||
  process.env.RATE_LIMIT_MAX_REQUESTS ||
  2000
);
const authenticatedApiMaxRequests = Number(
  process.env.API_RATE_LIMIT_AUTH_MAX ||
  Math.max(apiMaxRequests, 2000)
);

function resolveApiRateLimitMax(req: Request): number {
  const token = getAccessTokenFromRequest(req);
  if (!token) return apiMaxRequests;

  try {
    const payload = verifyAccessToken(token);
    if (payload.userId) {
      return authenticatedApiMaxRequests;
    }
  } catch {
    // Invalid/expired token: use unauthenticated max.
  }

  return apiMaxRequests;
}

/**
 * Rate limiter for authentication endpoints (/login, /register, /refresh).
 * Backed by Redis so the limit is shared across all pods.
 */
export const authRateLimiter = rateLimit({
  windowMs: authConfig.rateLimit.windowMs,
  max: authConfig.rateLimit.maxRequests,
  keyGenerator: authRateLimitKey,
  store: new RedisRateLimitStore('auth', authConfig.rateLimit.windowMs),
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
  store: new RedisRateLimitStore('strict', strictWindowMs),
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

export const vaultPasswordRateLimiter = rateLimit({
  windowMs: strictWindowMs,
  max: 3,
  keyGenerator: (req) => propertyScopedIpKey(req, 'vault-password'),
  skip: (req) => typeof req.body?.accessToken === 'string' && req.body.accessToken.trim().length > 0,
  store: new RedisRateLimitStore('vault-password', strictWindowMs),
  message: {
    success: false,
    error: {
      message: 'Too many vault password attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const vaultShareAccessRateLimiter = rateLimit({
  windowMs: strictWindowMs,
  max: 30,
  keyGenerator: (req) => propertyScopedIpKey(req, 'vault-share'),
  skip: (req) => !(typeof req.body?.accessToken === 'string' && req.body.accessToken.trim().length > 0),
  store: new RedisRateLimitStore('vault-share', strictWindowMs),
  message: {
    success: false,
    error: {
      message: 'Too many vault share-link requests, please try again later',
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
  max: resolveApiRateLimitMax,
  keyGenerator: rateLimitKey,
  // Auth routes have dedicated authRateLimiter policies and should not be
  // counted against the generic /api bucket.
  skip: (req) => {
    if (req.method === 'OPTIONS') return true;
    const path = getPathAtApiBoundary(req);
    return path === '/auth' || path.startsWith('/auth/');
  },
  store: new RedisRateLimitStore('api', apiWindowMs),
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
  store: new RedisRateLimitStore('ai-oracle', aiOracleWindowMs),
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
  store: new RedisRateLimitStore('gemini-chat', geminiWindowMs),
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
  store: new RedisRateLimitStore('expensive-ai', expensiveAiWindowMs),
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
  store: new RedisRateLimitStore('upload', uploadWindowMs),
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
  store: new RedisRateLimitStore('ocr', ocrWindowMs),
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
