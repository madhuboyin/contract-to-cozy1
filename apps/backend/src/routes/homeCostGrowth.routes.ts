// apps/backend/src/routes/homeCostGrowth.routes.ts
import { Router } from 'express';
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import * as controller from '../controllers/homeCostGrowth.controller';

const router = Router();

/**
 * Authenticated-only (Phase 1):
 * GET /api/properties/:propertyId/tools/cost-growth?years=5
 *
 * Optional query overrides:
 *  - assessedValue (USD)
 *  - taxRate (decimal)
 *  - homeValueNow (USD)
 *  - appreciationRate (decimal)
 *  - insuranceAnnualNow (USD)
 *  - maintenanceAnnualNow (USD)
 */
router.get(
  '/properties/:propertyId/tools/cost-growth',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getHomeCostGrowth
);

export default router;
