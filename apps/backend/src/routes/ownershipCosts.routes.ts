import { Router } from 'express';
import {
  createOwnershipCostScenario,
  deleteOwnershipCostScenario,
  getOwnershipCostForecast,
  getOwnershipCostDecisions,
  getOwnershipCostChanges,
  getOwnershipCosts,
  getOwnershipCostVariability,
  listOwnershipCostScenarios,
  recordOwnershipCostPlanningDecision,
  recordOwnershipCostDecision,
  recalculateOwnershipCostForecast,
  recalculateOwnershipCosts,
  updateOwnershipCostScenario,
  updateOwnershipCostNotificationPreferences,
} from '../controllers/ownershipCosts.controller';
import { authenticate } from '../middleware/auth.middleware';
import {
  propertyAuthMiddleware,
  requireHouseholdRole,
} from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

router.get(
  '/properties/:propertyId/ownership-costs/decisions',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  getOwnershipCostDecisions,
);

router.post(
  '/properties/:propertyId/ownership-costs/decisions',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  recordOwnershipCostDecision,
);

router.put(
  '/properties/:propertyId/ownership-costs/notification-preferences',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  updateOwnershipCostNotificationPreferences,
);

router.get(
  '/properties/:propertyId/ownership-costs/variability',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  getOwnershipCostVariability,
);

router.post(
  '/properties/:propertyId/ownership-costs/variability/decisions',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  recordOwnershipCostPlanningDecision,
);

router.get(
  '/properties/:propertyId/ownership-costs/forecast',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  getOwnershipCostForecast,
);

router.post(
  '/properties/:propertyId/ownership-costs/forecast/recalculate',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  recalculateOwnershipCostForecast,
);

router.get(
  '/properties/:propertyId/ownership-costs/scenarios',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  listOwnershipCostScenarios,
);

router.post(
  '/properties/:propertyId/ownership-costs/scenarios',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  createOwnershipCostScenario,
);

router.patch(
  '/properties/:propertyId/ownership-costs/scenarios/:scenarioId',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  updateOwnershipCostScenario,
);

router.delete(
  '/properties/:propertyId/ownership-costs/scenarios/:scenarioId',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  deleteOwnershipCostScenario,
);

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
