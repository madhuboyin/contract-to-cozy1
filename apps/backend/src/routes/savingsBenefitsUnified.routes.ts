import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { getSavingsBenefitsUnifiedForProperty } from '../controllers/savingsBenefitsUnified.controller';
import {
  getSavingsBenefitsCoverage,
  getSavingsBenefitsOpportunityDetail,
  patchSavingsBenefitsAction,
  postSavingsBenefitsActionOutcome,
  postSavingsBenefitsOpportunityAction,
  postSavingsBenefitsOpportunityFact,
} from '../controllers/savingsBenefitsUnified.controller';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.middleware';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

/**
 * GET /api/properties/:propertyId/savings-benefits
 *
 * Read-only, normalized view across the benefits (PropertyHiddenAssetMatch)
 * and recurring-cost (HomeSavingsOpportunity) opportunity models: everything
 * currently being pursued/applied, and everything with a verified RECEIVED
 * outcome. Does not expose any write actions — those remain on the
 * dedicated /hidden-assets and /home-savings endpoints.
 */
router.get(
  '/properties/:propertyId/savings-benefits',
  propertyAuthMiddleware,
  getSavingsBenefitsUnifiedForProperty,
);

router.get(
  '/properties/:propertyId/savings-benefits/coverage',
  propertyAuthMiddleware,
  getSavingsBenefitsCoverage,
);

router.get(
  '/properties/:propertyId/savings-benefits/opportunities/:opportunityId',
  propertyAuthMiddleware,
  getSavingsBenefitsOpportunityDetail,
);

const factBody = z.object({
  factKey: z.enum([
    'INCOME', 'DISABILITY', 'AGE', 'VETERAN_STATUS', 'TAX_FILING_STATUS',
    'HOUSEHOLD_COMPOSITION', 'HARDSHIP_STATUS', 'IMMIGRATION_STATUS', 'OTHER',
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]),
  consented: z.literal(true),
  consentVersion: z.string().trim().max(40).optional(),
});

router.post(
  '/properties/:propertyId/savings-benefits/opportunities/:opportunityId/facts',
  propertyAuthMiddleware,
  validateBody(factBody),
  postSavingsBenefitsOpportunityFact,
);

const actionBody = z.object({
  idempotencyKey: z.string().trim().min(1).max(160),
  family: z.enum(['BENEFIT', 'RECURRING_COST']),
  actionType: z.enum([
    'SAVE', 'DISMISS', 'PREPARE', 'OFFICIAL_SOURCE_OPENED', 'QUOTE_REQUESTED',
    'PARTNER_HANDOFF_CONSENTED', 'EXTERNALLY_SUBMITTED', 'APPROVED', 'DENIED',
    'SWITCHED', 'RECEIVED', 'FOLLOW_UP_SCHEDULED',
  ]),
  externalOwner: z.string().trim().max(200).nullable().optional(),
  consent: z.record(z.string(), z.unknown()).nullable().optional(),
  sharedFields: z.record(z.string(), z.unknown()).nullable().optional(),
  followUpAt: z.string().datetime().nullable().optional(),
});

router.post(
  '/properties/:propertyId/savings-benefits/opportunities/:opportunityId/actions',
  propertyAuthMiddleware,
  validateBody(actionBody),
  postSavingsBenefitsOpportunityAction,
);

const actionUpdateBody = z.object({
  state: z.enum(['STARTED', 'COMPLETED', 'CANCELLED']).optional(),
  followUpAt: z.string().datetime().nullable().optional(),
  checklist: z.array(z.object({
    key: z.string().trim().min(1).max(200),
    completed: z.boolean(),
    evidenceDocumentIds: z.array(z.string().uuid()).max(20).optional(),
  })).max(100).optional(),
}).refine(
  (body) => body.state !== undefined || body.followUpAt !== undefined || body.checklist !== undefined,
  { message: 'At least one action update is required.' },
);

router.patch(
  '/properties/:propertyId/savings-benefits/actions/:actionId',
  propertyAuthMiddleware,
  validateBody(actionUpdateBody),
  patchSavingsBenefitsAction,
);

const outcomeBody = z.object({
  stage: z.enum(['SUBMITTED', 'APPROVED', 'DENIED', 'RECEIVED', 'WITHDRAWN', 'EXPIRED', 'NO_ACTION']),
  amountReceived: z.number().nonnegative().nullable().optional(),
  observedMonthlyValue: z.number().nonnegative().nullable().optional(),
  observedAnnualValue: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  evidenceNote: z.string().trim().min(1).max(2000).nullable().optional(),
  denialReason: z.string().trim().min(1).max(2000).nullable().optional(),
  closureReason: z.string().trim().min(1).max(2000).nullable().optional(),
  documentIds: z.array(z.string().uuid()).max(10).optional(),
  observationStartedAt: z.string().datetime().nullable().optional(),
  observationEndedAt: z.string().datetime().nullable().optional(),
});

router.post(
  '/properties/:propertyId/savings-benefits/actions/:actionId/outcome',
  propertyAuthMiddleware,
  validateBody(outcomeBody),
  postSavingsBenefitsActionOutcome,
);

export default router;
