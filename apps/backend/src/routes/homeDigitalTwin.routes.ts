import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  initTwinBodySchema,
  createScenarioBodySchema,
  updateScenarioBodySchema,
  confirmComponentBodySchema,
} from '../validators/homeDigitalTwin.validators';
import {
  getTwin,
  initTwin,
  refreshTwin,
  getFactReadiness,
  confirmComponent,
  getRecommendedScenarios,
  listScenarios,
  createScenario,
  getScenario,
  updateScenario,
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
 * Returns the digital twin for the property, including:
 *   - twin metadata (status, version, completenessScore, confidenceScore)
 *   - all modeled components with age/condition/cost estimates
 *   - data quality dimension summaries
 *   - up to 5 recent non-archived scenarios
 *
 * Returns 404 if the twin has not been initialized yet.
 */
router.get(
  '/properties/:propertyId/home-digital-twin',
  propertyAuthMiddleware,
  getTwin,
);

/**
 * POST /api/properties/:propertyId/home-digital-twin/init
 *
 * Creates and builds the digital twin for the property if one does not
 * exist yet. Returns the existing twin if already present, unless
 * forceRefresh=true is passed to trigger a full rebuild.
 *
 * Body (optional):
 *   forceRefresh  boolean — default false
 */
router.post(
  '/properties/:propertyId/home-digital-twin/init',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(initTwinBodySchema),
  initTwin,
);

/**
 * POST /api/properties/:propertyId/home-digital-twin/refresh
 *
 * Recomputes all derived component state from the latest source data
 * (property profile, inventory, risk report) and re-evaluates all
 * quality dimensions. Returns the updated twin.
 *
 * Requires the twin to exist — call /init first.
 */
router.post(
  '/properties/:propertyId/home-digital-twin/refresh',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  refreshTwin,
);

// ============================================================================
// FACT READINESS (Home Record hub summary)
// ============================================================================

/**
 * GET /api/properties/:propertyId/home-digital-twin/fact-readiness
 *
 * Lightweight summary for the Home Record hub: how many facts are known
 * vs. need attention (conflicting, defaulted, or unknown), plus a bounded
 * list of specific items — each with a homeowner-readable reason and a
 * link to the existing surface that owns that fact (property edit, a
 * specific inventory item, or the inventory list). Does not itself accept
 * corrections; nothing here is a new place to edit data.
 *
 * Returns hasTwin=false (not a 404) when no twin exists yet — that's a
 * normal state for a new property, not an error.
 */
router.get(
  '/properties/:propertyId/home-digital-twin/fact-readiness',
  propertyAuthMiddleware,
  getFactReadiness,
);

/**
 * PATCH /api/properties/:propertyId/home-digital-twin/components/:componentId
 *
 * Confirms (or un-confirms) a component's currently derived values as
 * accurate. This is the "I reviewed this, it's correct" action — a
 * confirmed component is left untouched by future rebuilds. It is not a
 * value-correction API: to fix a wrong value, the homeowner still goes to
 * the canonical source (property edit, inventory, ...), which the
 * fact-readiness summary links to directly.
 *
 * Body:
 *   isUserConfirmed  boolean (required)
 */
router.patch(
  '/properties/:propertyId/home-digital-twin/components/:componentId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(confirmComponentBodySchema),
  confirmComponent,
);

// ============================================================================
// RECOMMENDED SCENARIOS
// ============================================================================

/**
 * GET /api/properties/:propertyId/home-digital-twin/recommended-scenarios
 *
 * Returns lightweight prebuilt scenario suggestions based on the current
 * state of the twin's modeled components. Nothing is persisted.
 *
 * Each suggestion includes:
 *   - key          deterministic slug (e.g. "replace-hvac")
 *   - title / description / reason
 *   - scenarioType / componentType
 *   - urgency      HIGH | MEDIUM | LOW
 *   - estimatedUpfrontCost
 *   - suggestedInputPayload — ready to send to POST /scenarios
 *
 * Suggestions are sorted by urgency (HIGH first).
 * Low-confidence or low-value suggestions are suppressed.
 */
router.get(
  '/properties/:propertyId/home-digital-twin/recommended-scenarios',
  propertyAuthMiddleware,
  getRecommendedScenarios,
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
 *
 * Results are ordered: pinned first, then by createdAt descending.
 */
router.get(
  '/properties/:propertyId/home-digital-twin/scenarios',
  propertyAuthMiddleware,
  listScenarios,
);

/**
 * POST /api/properties/:propertyId/home-digital-twin/scenarios
 *
 * Creates a new "what if" scenario. The inputPayload is validated
 * per scenarioType — invalid shapes are rejected with field-level errors.
 *
 * Body:
 *   name          string (required)
 *   scenarioType  HomeTwinScenarioType (required)
 *   description   string (optional)
 *   inputPayload  object (required) — see per-type shapes below
 *   isPinned      boolean (optional, default false)
 *
 * inputPayload shapes by scenarioType:
 *
 * REPLACE_COMPONENT / UPGRADE_COMPONENT:
 *   { componentType, assumptions: { replacementCost?, projectCost?, newUsefulLifeYears?,
 *     efficiencyGainPercent?, riskReductionPercent?, annualSavings? } }
 *
 * ENERGY_IMPROVEMENT:
 *   { upfrontCost, energySavingsPerYear, carbonOffsetTonsCO2PerYear?,
 *     comfortImpactDescription?, resilienceImpactDescription? }
 *
 * RESILIENCE_IMPROVEMENT:
 *   { upfrontCost, riskReductionPercent?, estimatedInsuranceSavingsPerYear?,
 *     estimatedPropertyValueChange?, resilienceImpactDescription? }
 *
 * ADD_FEATURE / RENOVATION:
 *   { upfrontCost, estimatedPropertyValueChange?, annualSavings?, description? }
 *
 * REMOVE_FEATURE:
 *   { removalCost?, annualSavings?, estimatedPropertyValueChange?, description? }
 *
 * CUSTOM:
 *   { expectedImpacts?: [{ impactType, valueNumeric?, valueText?, unit?, direction,
 *     confidenceScore? }], description? }
 */
router.post(
  '/properties/:propertyId/home-digital-twin/scenarios',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(createScenarioBodySchema),
  createScenario,
);

/**
 * GET /api/properties/:propertyId/home-digital-twin/scenarios/:scenarioId
 *
 * Returns a single scenario with full detail:
 *   - scenario metadata (name, type, status, description)
 *   - inputPayload (the scenario assumptions)
 *   - baselineSnapshot (twin state at creation time)
 *   - lastComputedAt
 *   - impacts[] — normalized computed outputs, sorted by sortOrder
 */
router.get(
  '/properties/:propertyId/home-digital-twin/scenarios/:scenarioId',
  propertyAuthMiddleware,
  getScenario,
);

/**
 * PATCH /api/properties/:propertyId/home-digital-twin/scenarios/:scenarioId
 *
 * Updates mutable metadata on a scenario.
 * At least one field must be provided.
 *
 * Body:
 *   isPinned    boolean (optional) — pin/unpin the scenario
 *   isArchived  boolean (optional) — archive/restore the scenario
 */
router.patch(
  '/properties/:propertyId/home-digital-twin/scenarios/:scenarioId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(updateScenarioBodySchema),
  updateScenario,
);

/**
 * POST /api/properties/:propertyId/home-digital-twin/scenarios/:scenarioId/compute
 *
 * Runs the impact compute engine for a saved scenario and persists
 * normalized HomeTwinScenarioImpact rows. Updates scenario status to COMPUTED.
 *
 * Safe to call multiple times — old impact rows are deleted and replaced
 * on each run (idempotent).
 */
router.post(
  '/properties/:propertyId/home-digital-twin/scenarios/:scenarioId/compute',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  computeScenario,
);

export default router;
