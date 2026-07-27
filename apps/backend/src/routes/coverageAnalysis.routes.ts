import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  getCoverageAnalysis,
  addCoverageOption,
  getCoverageComparisonWorkspace,
  getCoverageReview,
  getInsuranceHistory,
  recordCoverageComparisonDecision,
  runCoverageAnalysis,
  simulateCoverageAnalysis,
} from '../controllers/coverageAnalysis.controller';

const router = Router();

const overrideSchema = z.object({
  annualPremiumUsd: z.number().nonnegative().optional(),
  deductibleUsd: z.number().nonnegative().optional(),
  warrantyAnnualCostUsd: z.number().nonnegative().optional(),
  warrantyServiceFeeUsd: z.number().nonnegative().optional(),
  cashBufferUsd: z.number().nonnegative().optional(),
  riskTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

const runBodySchema = z.object({
  overrides: overrideSchema.optional(),
  assumptionSetId: z.string().uuid().optional(),
  guidanceJourneyId: z.string().uuid().optional(),
  guidanceStepKey: z.string().trim().min(1).max(80).optional(),
  guidanceSignalIntentFamily: z.string().trim().min(1).max(120).optional(),
});

const simulateBodySchema = z.object({
  overrides: overrideSchema.optional(),
  assumptionSetId: z.string().uuid().optional(),
  saveScenario: z.boolean().optional(),
  name: z.string().trim().max(120).optional(),
});

const comparisonFactSchema = z.object({
  factKey: z.string().trim().min(1).max(100),
  valueType: z.enum(['AMOUNT', 'TEXT', 'BOOLEAN', 'JSON']),
  amountValue: z.number().nonnegative().nullable().optional(),
  textValue: z.string().trim().max(500).nullable().optional(),
  booleanValue: z.boolean().nullable().optional(),
  jsonValue: z.unknown().optional(),
  currency: z.string().trim().length(3).nullable().optional(),
  confirmationStatus: z.enum(['CONFIRMED', 'PENDING']),
  sourcePage: z.number().int().positive().nullable().optional(),
});

const comparisonOptionSchema = z.object({
  optionType: z.enum(['QUOTE_DOCUMENT', 'POLICY_TERM']),
  label: z.string().trim().min(1).max(120),
  policyTermId: z.string().uuid().nullable().optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  carrierName: z.string().trim().max(160).nullable().optional(),
  facts: z.array(comparisonFactSchema).max(50).optional(),
});

const comparisonDecisionSchema = z.object({
  decision: z.enum(['KEEP', 'CHANGE', 'SHOP', 'DEFER', 'PROFESSIONAL_REVIEW']),
  selectedOptionId: z.string().uuid().nullable().optional(),
  rationale: z.string().trim().max(2000).nullable().optional(),
  guidanceJourneyId: z.string().uuid().nullable().optional(),
  guidanceStepKey: z.string().trim().min(1).max(80).nullable().optional(),
  sourceActionId: z.string().trim().min(1).max(160).nullable().optional(),
});

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/insurance-history',
  propertyAuthMiddleware,
  getInsuranceHistory
);

router.get(
  '/properties/:propertyId/coverage-comparison',
  propertyAuthMiddleware,
  getCoverageComparisonWorkspace
);

router.post(
  '/properties/:propertyId/coverage-comparisons/:comparisonId/options',
  propertyAuthMiddleware,
  validateBody(comparisonOptionSchema),
  addCoverageOption
);

router.post(
  '/properties/:propertyId/coverage-comparisons/:comparisonId/decision',
  propertyAuthMiddleware,
  validateBody(comparisonDecisionSchema),
  recordCoverageComparisonDecision
);

router.get(
  '/properties/:propertyId/coverage-review',
  propertyAuthMiddleware,
  getCoverageReview
);

router.get(
  '/properties/:propertyId/coverage-analysis',
  propertyAuthMiddleware,
  getCoverageAnalysis
);

router.post(
  '/properties/:propertyId/coverage-analysis/run',
  propertyAuthMiddleware,
  validateBody(runBodySchema),
  runCoverageAnalysis
);

router.post(
  '/properties/:propertyId/coverage-analysis/simulate',
  propertyAuthMiddleware,
  validateBody(simulateBodySchema),
  simulateCoverageAnalysis
);

export default router;
