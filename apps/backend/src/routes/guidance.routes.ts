import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  blockGuidanceStep,
  completeGuidanceStep,
  getGuidanceExecutionGuard,
  getGuidanceJourneyDetail,
  getGuidanceNextStep,
  getPropertyGuidance,
  listActiveGuidanceJourneys,
  recordGuidanceToolCompletion,
  resolveGuidanceSignal,
  skipGuidanceStep,
} from '../controllers/guidance.controller';

const router = Router();

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

router.use(apiRateLimiter);
router.use(authenticate);

router.get('/properties/:propertyId/guidance', propertyAuthMiddleware, getPropertyGuidance);
router.get('/properties/:propertyId/guidance/journeys', propertyAuthMiddleware, listActiveGuidanceJourneys);
router.get('/properties/:propertyId/guidance/journeys/:journeyId', propertyAuthMiddleware, getGuidanceJourneyDetail);
router.post('/properties/:propertyId/guidance/signals/resolve', propertyAuthMiddleware, validateBody(resolveSignalBodySchema), resolveGuidanceSignal);
router.get('/properties/:propertyId/guidance/next-step', propertyAuthMiddleware, getGuidanceNextStep);
router.get('/properties/:propertyId/guidance/execution-guard', propertyAuthMiddleware, getGuidanceExecutionGuard);

router.post(
  '/properties/:propertyId/guidance/steps/:stepId/complete',
  propertyAuthMiddleware,
  validateBody(completeStepBodySchema),
  completeGuidanceStep
);

router.post(
  '/properties/:propertyId/guidance/steps/:stepId/skip',
  propertyAuthMiddleware,
  validateBody(skipStepBodySchema),
  skipGuidanceStep
);

router.post(
  '/properties/:propertyId/guidance/steps/:stepId/block',
  propertyAuthMiddleware,
  validateBody(blockStepBodySchema),
  blockGuidanceStep
);

router.post(
  '/properties/:propertyId/guidance/tool-completions',
  propertyAuthMiddleware,
  validateBody(toolCompletionBodySchema),
  recordGuidanceToolCompletion
);

export default router;
