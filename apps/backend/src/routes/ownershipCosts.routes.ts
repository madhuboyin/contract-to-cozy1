import { Router } from 'express';
import {
  getOwnershipCostChanges,
  getOwnershipCosts,
  recalculateOwnershipCosts,
} from '../controllers/ownershipCosts.controller';
import { authenticate } from '../middleware/auth.middleware';
import {
  propertyAuthMiddleware,
  requireHouseholdRole,
} from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

router.get(
  '/properties/:propertyId/ownership-costs/changes',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  getOwnershipCostChanges,
);

router.get(
  '/properties/:propertyId/ownership-costs',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  getOwnershipCosts,
);

router.post(
  '/properties/:propertyId/ownership-costs/recalculate',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  recalculateOwnershipCosts,
);

export default router;
