import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  declineSensitiveFactForMatch,
  deleteSensitiveFactForMatch,
  listSensitiveFactsForMatch,
  submitSensitiveFactForMatch,
} from '../controllers/hiddenAssetSensitiveFacts.controller';

const router = Router();

const SENSITIVE_FACT_KEYS = [
  'INCOME',
  'DISABILITY',
  'AGE',
  'VETERAN_STATUS',
  'TAX_FILING_STATUS',
  'HOUSEHOLD_COMPOSITION',
  'HARDSHIP_STATUS',
  'IMMIGRATION_STATUS',
  'OTHER',
] as const;

const submitSensitiveFactBodySchema = z.object({
  factKey: z.enum(SENSITIVE_FACT_KEYS),
  value: z.union([z.string(), z.number(), z.boolean()]),
  consented: z.literal(true),
  consentVersion: z.string().trim().max(40).optional(),
});

router.use(apiRateLimiter);
router.use(authenticate);

/**
 * GET /api/property-hidden-asset-matches/:matchId/sensitive-facts
 *
 * Which sensitive eligibility facts (if any) this match's program actually
 * requests, each with its current REQUESTED/PROVIDED/DECLINED status and
 * the homeowner-facing "why" copy. Never returns a captured value.
 */
router.get('/property-hidden-asset-matches/:matchId/sensitive-facts', listSensitiveFactsForMatch);

/**
 * POST /api/property-hidden-asset-matches/:matchId/sensitive-facts
 *
 * Records a consented, purpose-bound answer for one named match and
 * re-evaluates that match's confidence. Requires consented: true —
 * a request without it is rejected, never defaulted.
 */
router.post(
  '/property-hidden-asset-matches/:matchId/sensitive-facts',
  validateBody(submitSensitiveFactBodySchema),
  submitSensitiveFactForMatch,
);

/**
 * POST /api/property-hidden-asset-matches/:matchId/sensitive-facts/:factKey/decline
 *
 * Records that the homeowner was asked and chose not to answer. No value
 * is ever stored for a decline.
 */
router.post(
  '/property-hidden-asset-matches/:matchId/sensitive-facts/:factKey/decline',
  declineSensitiveFactForMatch,
);

/**
 * DELETE /api/property-hidden-asset-matches/:matchId/sensitive-facts/:factKey
 *
 * Hard-deletes a previously provided/declined fact — real retention
 * minimization, not a soft-delete flag.
 */
router.delete(
  '/property-hidden-asset-matches/:matchId/sensitive-facts/:factKey',
  deleteSensitiveFactForMatch,
);

export default router;
