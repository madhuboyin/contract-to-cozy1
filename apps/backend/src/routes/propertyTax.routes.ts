// apps/backend/src/routes/propertyTax.routes.ts
import { Router } from 'express';
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware';
import { requireMfa, requireRole } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { UserRole } from '../types/auth.types';
import * as controller from '../controllers/propertyTax.controller';

const router = Router();

/**
 * Authenticated-only (v1):
 * GET /api/properties/:propertyId/property-tax/estimate
 *
 * Optional query params:
 *  - assessedValue: number (USD) override
 *  - taxRate: number (decimal) override e.g. 0.0185
 */
router.get(
  '/properties/:propertyId/property-tax/rules',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getPropertyTaxRules
);

router.get(
  '/properties/:propertyId/property-tax/coverage',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getPropertyTaxCoverage
);

const propertyTaxRuleAdmin = [
  apiRateLimiter,
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('INTEGRATION_MANAGE'),
] as const;

router.post(
  '/admin/property-tax/rules/:profileId/activate',
  ...propertyTaxRuleAdmin,
  controller.activatePropertyTaxRule,
);
router.post(
  '/admin/property-tax/rules/:profileId/emergency-disable',
  ...propertyTaxRuleAdmin,
  controller.disablePropertyTaxRule,
);
router.post(
  '/admin/property-tax/rules/:profileId/rollback',
  ...propertyTaxRuleAdmin,
  controller.rollbackPropertyTaxRule,
);

router.get(
  '/properties/:propertyId/property-tax/record',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getPropertyTaxCenter
);

router.post(
  '/properties/:propertyId/property-tax/record/homeowner',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.recordHomeownerPropertyTaxValues
);

router.get(
  '/properties/:propertyId/property-tax/estimate',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getPropertyTaxEstimate
);

export default router;
