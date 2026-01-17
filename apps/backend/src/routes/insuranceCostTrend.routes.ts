// apps/backend/src/routes/insuranceCostTrend.routes.ts
import { Router } from 'express';
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import * as controller from '../controllers/insuranceCostTrend.controller';

const router = Router();

/**
 * GET /api/properties/:propertyId/tools/insurance-trend?years=5
 * Optional query overrides:
 *  - homeValueNow
 *  - insuranceAnnualNow
 *  - inflationRate
 */
router.get(
  '/properties/:propertyId/tools/insurance-trend',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  controller.getInsuranceCostTrend
);

export default router;
