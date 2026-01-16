// apps/backend/src/routes/propertyTax.routes.ts
import { Router } from 'express';
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import * as controller from '../controllers/propertyTax.controller';

const router = Router();

/**
 * Authenticated-only (v1):
 * GET /api/properties/:propertyId/property-tax/estimate
 *
 * Optional query params:
 *  - assessedValue: number (USD) override
 *  - taxRate: number (decimal) override e.g. 0.0185
 *  - historyYears: number (default 7)
 */
router.get(
  '/properties/:propertyId/property-tax/estimate',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getPropertyTaxEstimate
);

export default router;
