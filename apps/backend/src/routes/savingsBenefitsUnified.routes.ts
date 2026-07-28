import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { getSavingsBenefitsUnifiedForProperty } from '../controllers/savingsBenefitsUnified.controller';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

/**
 * GET /api/properties/:propertyId/savings-benefits
 *
 * Read-only, normalized view across the benefits (PropertyHiddenAssetMatch)
 * and recurring-cost (HomeSavingsOpportunity) opportunity models: everything
 * currently being pursued/applied, and everything with a verified RECEIVED
 * outcome. Does not expose any write actions — those remain on the
 * dedicated /hidden-assets and /home-savings endpoints.
 */
router.get(
  '/properties/:propertyId/savings-benefits',
  propertyAuthMiddleware,
  getSavingsBenefitsUnifiedForProperty,
);

export default router;
