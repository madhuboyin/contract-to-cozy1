import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import type { AuthRequest } from '../types/auth.types';
import { getToolDiscoveryAvailability } from '../services/toolDiscoveryAvailability.service';
import { ingestToolLifecycleEvents } from '../controllers/toolLifecycleAnalytics.controller';
import {
  canonicalizeToolLifecycleId,
  TOOL_LIFECYCLE_STAGES,
} from '../services/analytics/toolLifecycle';

const router = Router();

const toolLifecycleEventSchema = z.object({
  toolId: z.string().trim().min(1).max(120).refine(
    (value) => canonicalizeToolLifecycleId(value) === value,
    'Unknown or non-canonical tool ID.',
  ),
  stage: z.enum(TOOL_LIFECYCLE_STAGES),
  surface: z.string().trim().min(1).max(80),
  recommendationReason: z.string().trim().max(240).optional().nullable(),
  contextVersion: z.string().trim().max(120).optional().nullable(),
  sourceActionId: z.string().trim().max(160).optional().nullable(),
  sourceEntityType: z.string().trim().max(120).optional().nullable(),
  sourceEntityId: z.string().trim().max(160).optional().nullable(),
  journeyId: z.string().trim().max(160).optional().nullable(),
  completionKind: z.string().trim().max(80).optional().nullable(),
  outputKey: z.string().trim().max(160).optional().nullable(),
  durationSeconds: z.number().min(0).max(86_400).optional().nullable(),
  sessionKey: z.string().trim().max(120).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

const toolLifecycleBodySchema = z.object({
  events: z.array(toolLifecycleEventSchema).min(1).max(50),
});

router.get('/tool-discovery/availability', authenticate, (req: AuthRequest, res: Response): void => {
  res.status(200).json({
    success: true,
    data: getToolDiscoveryAvailability(req.user?.userId),
  });
});

router.post(
  '/properties/:propertyId/tool-discovery/events',
  apiRateLimiter,
  authenticate,
  propertyAuthMiddleware,
  validateBody(toolLifecycleBodySchema),
  ingestToolLifecycleEvents,
);

export default router;
