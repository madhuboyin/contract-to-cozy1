// apps/backend/src/middleware/ocrRateLimiter.middleware.ts
import type { Response, NextFunction } from 'express';
import type { CustomRequest } from '../types';

type Bucket = { tokens: number; lastRefillMs: number };

const buckets = new Map<string, Bucket>();

export function ocrRateLimiter(req: CustomRequest, res: Response, next: NextFunction) {
  const userId = (req as any)?.user?.id || 'anon';
  const propertyId = (req.params as any)?.propertyId || 'unknown';

  // Keep it configurable
  const maxPerMinute = Number(process.env.OCR_MAX_PER_MINUTE || 6); // stricter than global
  const key = `${userId}:${propertyId}`;

  const now = Date.now();
  const refillRatePerMs = maxPerMinute / (60 * 1000);

  const b = buckets.get(key) || { tokens: maxPerMinute, lastRefillMs: now };

  // Refill
  const elapsed = now - b.lastRefillMs;
  const refill = elapsed * refillRatePerMs;
  b.tokens = Math.min(maxPerMinute, b.tokens + refill);
  b.lastRefillMs = now;

  if (b.tokens < 1) {
    // Estimate seconds until 1 token available
    const deficit = 1 - b.tokens;
    const retryAfterSec = Math.max(1, Math.ceil(deficit / refillRatePerMs / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      code: 'OCR_RATE_LIMITED',
      message: 'OCR rate limit reached. Please try again shortly.',
      retryAfterSec,
    });
  }

  b.tokens -= 1;
  buckets.set(key, b);
  return next();
}
