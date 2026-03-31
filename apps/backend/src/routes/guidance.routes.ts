import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  blockGuidanceStep,
  changeGuidanceJourneyIssue,
  completeGuidanceStep,
  dismissGuidanceJourney,
  getAssetResolutionContext,
  getGuidanceExecutionGuard,
  getGuidanceIssueTypes,
  getGuidanceJourneyDetail,
  getGuidanceNextStep,
  getGuidanceServiceCategories,
  getGuidanceSymptomTypes,
  getPropertyGuidance,
  listActiveGuidanceJourneys,
  recordGuidanceToolCompletion,
  resolveGuidanceSignal,
  skipGuidanceStep,
  startGuidanceJourney,
} from '../controllers/guidance.controller';

const router = Router();

const propertyParamsSchema = z.object({
  params: z.object({
    propertyId: z.string().uuid(),
  }),
});

const propertyJourneyParamsSchema = z.object({
  params: z.object({
    propertyId: z.string().uuid(),
    journeyId: z.string().uuid(),
  }),
});

const propertyStepParamsSchema = z.object({
  params: z.object({
    propertyId: z.string().uuid(),
    stepId: z.string().uuid(),
  }),
});

const nextStepQuerySchema = z.object({
  params: z.object({
    propertyId: z.string().uuid(),
  }),
  query: z.object({
    journeyId: z.string().uuid(),
  }),
});

const executionGuardQuerySchema = z.object({
  params: z.object({
    propertyId: z.string().uuid(),
  }),
  query: z.object({
    targetAction: z
      .enum(['BOOKING', 'CLAIM_ESCALATION', 'INSPECTION_SCHEDULING', 'PROVIDER_HANDOFF', 'EXECUTION'])
      .optional(),
    journeyId: z.string().uuid().optional(),
    inventoryItemId: z.string().uuid().optional(),
    homeAssetId: z.string().uuid().optional(),
  }),
});

const resolveSignalBodySchema = z.object({
  homeAssetId: z.string().uuid().optional(),
  inventoryItemId: z.string().uuid().optional(),
  signalIntentFamily: z.string().trim().min(2).max(120).optional(),
  issueDomain: z.string().trim().min(2).max(40).optional(),
  decisionStage: z.string().trim().min(2).max(40).optional(),
  executionReadiness: z.string().trim().min(2).max(40).optional(),
  severity: z.string().trim().min(2).max(40).optional(),
  severityScore: z.number().min(0).max(100).optional(),
  confidenceScore: z.number().min(0).max(100).optional(),
  sourceType: z.string().trim().min(2).max(80).optional(),
  sourceFeatureKey: z.string().trim().min(2).max(120).optional(),
  sourceToolKey: z.string().trim().min(2).max(120).optional(),
  sourceEntityType: z.string().trim().min(2).max(120).optional(),
  sourceEntityId: z.string().trim().min(2).max(120).optional(),
  payloadJson: z.record(z.string(), z.unknown()).optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
});

const completeStepBodySchema = z.object({
  producedData: z.record(z.string(), z.unknown()).optional(),
});

const skipStepBodySchema = z.object({
  reasonCode: z.string().trim().min(2).max(80).optional(),
  reasonMessage: z.string().trim().max(500).optional(),
  producedData: z.record(z.string(), z.unknown()).optional(),
});

const blockStepBodySchema = z.object({
  reasonCode: z.string().trim().min(2).max(80).optional(),
  reasonMessage: z.string().trim().max(500).optional(),
  missingContextKeys: z.array(z.string().trim().min(1).max(120)).optional(),
});

const toolCompletionBodySchema = z.object({
  journeyId: z.string().uuid().optional(),
  signalIntentFamily: z.string().trim().min(2).max(120).optional(),
  issueDomain: z.string().trim().min(2).max(40).optional(),
  homeAssetId: z.string().uuid().optional(),
  inventoryItemId: z.string().uuid().optional(),
  sourceEntityType: z.string().trim().min(2).max(120).optional(),
  sourceEntityId: z.string().trim().min(2).max(120).optional(),
  sourceToolKey: z.string().trim().min(2).max(120),
  stepKey: z.string().trim().min(2).max(120).optional(),
  status: z.enum(['COMPLETED', 'SKIPPED', 'BLOCKED', 'IN_PROGRESS']),
  producedData: z.record(z.string(), z.unknown()).optional(),
  reasonCode: z.string().trim().min(2).max(80).optional(),
  reasonMessage: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const startJourneyBodySchema = z.object({
  scopeCategory: z.enum(['ITEM', 'SERVICE']),
  scopeId: z.string().trim().min(1).max(255),
  issueType: z.string().trim().min(1).max(120),
  inventoryItemId: z.string().uuid().optional(),
  homeAssetId: z.string().uuid().optional(),
  serviceKey: z.string().trim().min(1).max(120).optional(),
});

const dismissJourneyBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const changeIssueBodySchema = z.object({
  issueType: z.string().trim().min(1).max(120),
});

const issueTypesQuerySchema = z.object({
  params: z.object({ propertyId: z.string().uuid() }),
  query: z.object({ scopeCategory: z.enum(['ITEM', 'SERVICE']).optional() }),
});

// FRD-FR-04: symptom types by InventoryItemCategory
const symptomTypesQuerySchema = z.object({
  params: z.object({ propertyId: z.string().uuid() }),
  query: z.object({
    category: z.string().trim().min(1).max(80).optional(),
  }),
});

// FRD-FR-03: asset resolution context (2-year lookback)
const assetResolutionContextQuerySchema = z.object({
  params: z.object({ propertyId: z.string().uuid() }),
  query: z.object({
    inventoryItemId: z.string().uuid(),
  }),
});

router.use(apiRateLimiter);
router.use(authenticate);

router.get('/properties/:propertyId/guidance', validate(propertyParamsSchema), propertyAuthMiddleware, getPropertyGuidance);
router.get(
  '/properties/:propertyId/guidance/journeys',
  validate(propertyParamsSchema),
  propertyAuthMiddleware,
  listActiveGuidanceJourneys
);
router.get(
  '/properties/:propertyId/guidance/journeys/:journeyId',
  validate(propertyJourneyParamsSchema),
  propertyAuthMiddleware,
  getGuidanceJourneyDetail
);
router.post(
  '/properties/:propertyId/guidance/signals/resolve',
  validate(propertyParamsSchema),
  propertyAuthMiddleware,
  validateBody(resolveSignalBodySchema),
  resolveGuidanceSignal
);
router.get(
  '/properties/:propertyId/guidance/next-step',
  validate(nextStepQuerySchema),
  propertyAuthMiddleware,
  getGuidanceNextStep
);
router.get(
  '/properties/:propertyId/guidance/execution-guard',
  validate(executionGuardQuerySchema),
  propertyAuthMiddleware,
  getGuidanceExecutionGuard
);

router.post(
  '/properties/:propertyId/guidance/steps/:stepId/complete',
  validate(propertyStepParamsSchema),
  propertyAuthMiddleware,
  validateBody(completeStepBodySchema),
  completeGuidanceStep
);

router.post(
  '/properties/:propertyId/guidance/steps/:stepId/skip',
  validate(propertyStepParamsSchema),
  propertyAuthMiddleware,
  validateBody(skipStepBodySchema),
  skipGuidanceStep
);

router.post(
  '/properties/:propertyId/guidance/steps/:stepId/block',
  validate(propertyStepParamsSchema),
  propertyAuthMiddleware,
  validateBody(blockStepBodySchema),
  blockGuidanceStep
);

router.post(
  '/properties/:propertyId/guidance/tool-completions',
  validate(propertyParamsSchema),
  propertyAuthMiddleware,
  validateBody(toolCompletionBodySchema),
  recordGuidanceToolCompletion
);

// IMP-GE-1: User-initiated journey endpoints
router.post(
  '/properties/:propertyId/guidance/journeys/start',
  validate(propertyParamsSchema),
  propertyAuthMiddleware,
  validateBody(startJourneyBodySchema),
  startGuidanceJourney
);

router.post(
  '/properties/:propertyId/guidance/journeys/:journeyId/dismiss',
  validate(propertyJourneyParamsSchema),
  propertyAuthMiddleware,
  validateBody(dismissJourneyBodySchema),
  dismissGuidanceJourney
);

router.post(
  '/properties/:propertyId/guidance/journeys/:journeyId/change-issue',
  validate(propertyJourneyParamsSchema),
  propertyAuthMiddleware,
  validateBody(changeIssueBodySchema),
  changeGuidanceJourneyIssue
);

router.get(
  '/properties/:propertyId/guidance/issue-types',
  validate(issueTypesQuerySchema),
  propertyAuthMiddleware,
  getGuidanceIssueTypes
);

router.get(
  '/properties/:propertyId/guidance/service-categories',
  validate(propertyParamsSchema),
  propertyAuthMiddleware,
  getGuidanceServiceCategories
);

// FRD-FR-04: symptom types scoped to an InventoryItemCategory
router.get(
  '/properties/:propertyId/guidance/symptom-types',
  validate(symptomTypesQuerySchema),
  propertyAuthMiddleware,
  getGuidanceSymptomTypes
);

// FRD-FR-03: 2-year lookback context for the verify_history step
router.get(
  '/properties/:propertyId/guidance/asset-resolution-context',
  validate(assetResolutionContextQuerySchema),
  propertyAuthMiddleware,
  getAssetResolutionContext
);

export default router;
