import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  getHiddenAssetsForProperty,
  getHiddenAssetProgramDetail,
  refreshHiddenAssetsForProperty,
  updateHiddenAssetMatchStatus,
} from '../controllers/hiddenAssets.controller';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const updateMatchStatusBodySchema = z.object({
  status: z.enum(['VIEWED', 'DISMISSED', 'CLAIMED']),
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
 *   status           DETECTED | VIEWED | DISMISSED | CLAIMED | EXPIRED | INACTIVE
 *   includeDismissed true — include DISMISSED matches
 *   includeExpired   true — include EXPIRED matches
 */
router.get(
  '/properties/:propertyId/hidden-assets',
  propertyAuthMiddleware,
  getHiddenAssetsForProperty,
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
 * Allowed transitions: DETECTED → VIEWED, DISMISSED, or CLAIMED.
 * Property ownership is verified inside the service.
 */
router.patch(
  '/property-hidden-asset-matches/:matchId',
  validateBody(updateMatchStatusBodySchema),
  updateHiddenAssetMatchStatus,
);

export default router;
