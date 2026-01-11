// apps/backend/src/middleware/premiumOcrGate.middleware.ts
import type { Response, NextFunction } from 'express';
import type { CustomRequest } from '../types';

function isPremiumUser(req: CustomRequest): boolean {
  const u: any = (req as any).user;
  if (!u) return false;

  // Support a few likely shapes
  const plan = (u.plan || u.subscriptionPlan || u.tier || '').toString().toUpperCase();
  if (plan.includes('PREMIUM') || plan.includes('PRO')) return true;

  // Boolean flags if you have them
  if (u.isPremium === true || u.premium === true) return true;

  return false;
}

export function requirePremiumForOcr(req: CustomRequest, res: Response, next: NextFunction) {
  // Allow turning gating off temporarily
  if (process.env.OCR_PREMIUM_ONLY === 'false') return next();
  if (process.env.OCR_PREMIUM_ONLY === undefined) {
    // default: premium-only ON (matches your spec)
  }

  if (!isPremiumUser(req)) {
    return res.status(402).json({
      code: 'PREMIUM_REQUIRED',
      message: 'Label OCR + confidence scoring is a Premium feature.',
      feature: 'INVENTORY_OCR',
    });
  }

  return next();
}
