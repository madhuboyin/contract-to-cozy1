import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  createHiddenAssetMatchOutcome,
  getHiddenAssetCoverageForProperty,
  getHiddenAssetsForProperty,
  getHiddenAssetProgramDetail,
  listHiddenAssetMatchOutcomes,
  refreshHiddenAssetsForProperty,
  updateHiddenAssetMatchStatus,
  revokeHiddenAssetMatchOutcomeController,
} from '../controllers/hiddenAssets.controller';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const updateMatchStatusBodySchema = z.object({
  // VIEWED is presentation state, not an application decision. Dismiss and
  // pursue now flow only through the canonical action endpoint.
  status: z.literal('VIEWED'),
});

const recordMatchOutcomeBodySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  stage: z.enum(['SUBMITTED', 'APPROVED', 'DENIED', 'RECEIVED', 'WITHDRAWN', 'EXPIRED', 'NO_ACTION']),
  amountReceived: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  evidenceNote: z.string().trim().min(1).max(2000).nullable().optional(),
  denialReason: z.string().trim().min(1).max(2000).nullable().optional(),
  closureReason: z.string().trim().min(1).max(2000).nullable().optional(),
  documentIds: z.array(z.string().uuid()).max(10).optional(),
  supersedesOutcomeId: z.string().uuid().nullable().optional(),
});
const revokeOutcomeBodySchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

// ============================================================================
// MIDDLEWARE — applied to all routes in this router
// ============================================================================

router.use(apiRateLimiter);
router.use(authenticate);

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/properties/:propertyId/hidden-assets
 *
 * Returns all visible hidden asset matches for a property.
 *
 * Query params (all optional):
 *   confidenceLevel  HIGH | MEDIUM | LOW
 *   category         TAX_EXEMPTION | REBATE | UTILITY_INCENTIVE | INSURANCE_DISCOUNT |
 *                    ENERGY_CREDIT | LOCAL_GRANT | HISTORIC_BENEFIT | STORM_RESILIENCE
 *   status           DETECTED | VIEWED | DISMISSED | PURSUING | EXPIRED | INACTIVE
 *   includeDismissed true — include DISMISSED matches
 *   includeExpired   true — include EXPIRED matches
 */
router.get(
  '/properties/:propertyId/hidden-assets',
  propertyAuthMiddleware,
  getHiddenAssetsForProperty,
);

router.post(
  '/property-hidden-asset-match-outcomes/:outcomeId/revoke',
  validateBody(revokeOutcomeBodySchema),
  revokeHiddenAssetMatchOutcomeController,
);

/**
 * POST /api/properties/:propertyId/hidden-assets/refresh
 *
 * Triggers a full detection scan for the property.
 * Evaluates all active programs against property attributes,
 * upserts match rows, and returns an updated match list.
 */
router.post(
  '/properties/:propertyId/hidden-assets/refresh',
  propertyAuthMiddleware,
  refreshHiddenAssetsForProperty,
);

/**
 * GET /api/properties/:propertyId/hidden-assets/coverage
 *
 * Reports which reviewed sources cover this property's region and which
 * benefit categories have no published program there — the real answer to
 * "what was checked," distinct from "how many matches were found."
 */
router.get(
  '/properties/:propertyId/hidden-assets/coverage',
  propertyAuthMiddleware,
  getHiddenAssetCoverageForProperty,
);

/**
 * GET /api/hidden-asset-programs/:programId
 *
 * Returns master detail for a single incentive program.
 * Any authenticated user can retrieve program detail.
 */
router.get('/hidden-asset-programs/:programId', getHiddenAssetProgramDetail);

/**
 * PATCH /api/property-hidden-asset-matches/:matchId
 *
 * Updates the user-facing status of a match.
 * Allowed transitions: DETECTED → VIEWED, DISMISSED, or PURSUING.
 * Property ownership is verified inside the service.
 */
router.patch(
  '/property-hidden-asset-matches/:matchId',
  validateBody(updateMatchStatusBodySchema),
  updateHiddenAssetMatchStatus,
);

/**
 * POST /api/property-hidden-asset-matches/:matchId/outcome
 *
 * Records the next stage in a match's application/award trail
 * (SUBMITTED → APPROVED/DENIED/WITHDRAWN → RECEIVED). RECEIVED requires
 * amountReceived and evidenceNote; DENIED requires denialReason. Property
 * ownership is verified inside the service.
 */
router.post(
  '/property-hidden-asset-matches/:matchId/outcome',
  validateBody(recordMatchOutcomeBodySchema),
  createHiddenAssetMatchOutcome,
);

/**
 * GET /api/property-hidden-asset-matches/:matchId/outcome
 *
 * Returns the full outcome history for a match, oldest first.
 */
router.get(
  '/property-hidden-asset-matches/:matchId/outcome',
  listHiddenAssetMatchOutcomes,
);

export default router;
