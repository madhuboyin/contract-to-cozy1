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

const legacyOwnershipCostApis = [
  ['true-cost', 'current'],
  ['cost-explainer', 'changes'],
  ['cost-growth', 'forecast'],
  ['cost-volatility', 'variability'],
] as const;

for (const [legacyTool, view] of legacyOwnershipCostApis) {
  router.get(
    `/properties/:propertyId/tools/${legacyTool}`,
    authenticate,
    apiRateLimiter,
    propertyAuthMiddleware,
    (req, res) => res.status(410).json({
      success: false,
      code: 'OWNERSHIP_COST_LEGACY_API_RETIRED',
      message:
        `${legacyTool} was consolidated into the versioned Ownership Costs contract.`,
      canonicalUrl:
        `/api/properties/${encodeURIComponent(req.params.propertyId)}/ownership-costs/${view === 'current' ? '' : view}`
          .replace(/\/$/, ''),
      lens: 'OPERATING_EXPENSE',
    }),
  );
}

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
