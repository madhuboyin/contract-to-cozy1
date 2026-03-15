import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  initTwinBodySchema,
  createScenarioBodySchema,
} from '../validators/homeDigitalTwin.validators';
import {
  getTwin,
  initTwin,
  refreshTwin,
  listScenarios,
  createScenario,
  getScenario,
  computeScenario,
} from '../controllers/homeDigitalTwin.controller';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ============================================================================
// TWIN LIFECYCLE
// ============================================================================

/**
 * GET /api/properties/:propertyId/home-digital-twin
 *
 * Returns the digital twin for the property including all modeled
 * components, data quality dimensions, and recent scenarios.
 * Returns 404 if twin has not been initialized yet.
 */
router.get(
  '/properties/:propertyId/home-digital-twin',
  propertyAuthMiddleware,
  getTwin,
);

/**
 * POST /api/properties/:propertyId/home-digital-twin/init
 *
 * Creates and builds a digital twin for the property if one does not
 * exist yet. If the twin already exists, returns it unless
 * forceRefresh=true is passed in the body, which triggers a rebuild.
 *
 * Body (optional):
 *   forceRefresh  boolean — default false
 */
router.post(
  '/properties/:propertyId/home-digital-twin/init',
  propertyAuthMiddleware,
  validateBody(initTwinBodySchema),
  initTwin,
);

/**
 * POST /api/properties/:propertyId/home-digital-twin/refresh
 *
 * Recomputes all derived component state from current source data
 * and re-evaluates data quality. Returns the updated twin.
 * Requires the twin to exist (call /init first).
 */
router.post(
  '/properties/:propertyId/home-digital-twin/refresh',
  propertyAuthMiddleware,
  refreshTwin,
);

// ============================================================================
// SCENARIOS
// ============================================================================

/**
 * GET /api/properties/:propertyId/home-digital-twin/scenarios
 *
 * Lists saved scenarios for the property twin.
 *
 * Query params (all optional):
 *   status          DRAFT | READY | COMPUTED | FAILED | ARCHIVED
 *   includeArchived true — include archived scenarios (default false)
 */
router.get(
  '/properties/:propertyId/home-digital-twin/scenarios',
  propertyAuthMiddleware,
  listScenarios,
);

/**
 * POST /api/properties/:propertyId/home-digital-twin/scenarios
 *
 * Creates a new "what if" scenario for the property twin.
 *
 * Body:
 *   name          string (required)
 *   scenarioType  HomeTwinScenarioType (required)
 *   description   string (optional)
 *   inputPayload  object (required) — scenario assumptions
 *   isPinned      boolean (optional, default false)
 *
 * Scenario types and expected inputPayload shapes:
 *
 * REPLACE_COMPONENT / UPGRADE_COMPONENT:
 *   { componentType: "HVAC", assumptions: { replacementCost: 9800, newUsefulLifeYears: 15, efficiencyGainPercent: 18 } }
 *
 * ENERGY_IMPROVEMENT:
 *   { upfrontCost: 5000, energySavingsPerYear: 800, carbonOffsetTonsCO2PerYear: 1.2 }
 *
 * RESILIENCE_IMPROVEMENT:
 *   { upfrontCost: 3000, riskReductionPercent: 15, estimatedInsuranceSavingsPerYear: 200 }
 *
 * ADD_FEATURE / RENOVATION:
 *   { upfrontCost: 20000, estimatedPropertyValueChange: 15000, annualSavings: 0 }
 *
 * CUSTOM / REMOVE_FEATURE:
 *   { expectedImpacts: [{ impactType: "UPFRONT_COST", valueNumeric: 5000, unit: "USD", direction: "NEGATIVE" }] }
 */
router.post(
  '/properties/:propertyId/home-digital-twin/scenarios',
  propertyAuthMiddleware,
  validateBody(createScenarioBodySchema),
  createScenario,
);

/**
 * GET /api/properties/:propertyId/home-digital-twin/scenarios/:scenarioId
 *
 * Returns a single scenario with its computed impacts.
 */
router.get(
  '/properties/:propertyId/home-digital-twin/scenarios/:scenarioId',
  propertyAuthMiddleware,
  getScenario,
);

/**
 * POST /api/properties/:propertyId/home-digital-twin/scenarios/:scenarioId/compute
 *
 * Computes impact outputs for a saved scenario and persists them as
 * HomeTwinScenarioImpact rows. Updates scenario status to COMPUTED.
 * Safe to call multiple times (recomputes each time).
 */
router.post(
  '/properties/:propertyId/home-digital-twin/scenarios/:scenarioId/compute',
  propertyAuthMiddleware,
  computeScenario,
);

export default router;
