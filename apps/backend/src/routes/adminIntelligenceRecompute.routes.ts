// apps/backend/src/routes/adminIntelligenceRecompute.routes.ts
//
// Home Intelligence Functional Completeness FRD §15 Phase 2 work item 7 —
// "add admin manual full refresh and failed-target retry." Reuses
// WORKER_JOB_VIEW/WORKER_JOB_TRIGGER — already-declared capabilities
// (adminCapabilities.ts) assigned to a persona bundle, matching this
// feature's real semantics (triggering/inspecting a background processing
// pipeline) rather than adding a new capability for it.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import {
  triggerManualRefreshHandler,
  retryFailedTargetHandler,
  getPropertyRefreshStateHandler,
} from '../controllers/adminIntelligenceRecompute.controller';

const router = Router();

router.use('/admin/intelligence-recompute', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/intelligence-recompute/properties/{propertyId}/refresh-state:
 *   get:
 *     summary: A property's current intelligence-recompute refresh state and recent runs — admin-only
 *     tags: [Admin Intelligence Recompute]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/admin/intelligence-recompute/properties/:propertyId/refresh-state',
  requireCapability('WORKER_JOB_VIEW'),
  getPropertyRefreshStateHandler,
);

/**
 * @swagger
 * /api/admin/intelligence-recompute/properties/{propertyId}/refresh:
 *   post:
 *     summary: Trigger a manual full intelligence recompute for a property (HI-REC-003) — admin-only
 *     tags: [Admin Intelligence Recompute]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/intelligence-recompute/properties/:propertyId/refresh',
  requireCapability('WORKER_JOB_TRIGGER'),
  triggerManualRefreshHandler,
);

/**
 * @swagger
 * /api/admin/intelligence-recompute/runs/{runId}/targets/{targetId}/retry:
 *   post:
 *     summary: Retry one FAILED recompute target — admin-only
 *     tags: [Admin Intelligence Recompute]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/intelligence-recompute/runs/:runId/targets/:targetId/retry',
  requireCapability('WORKER_JOB_TRIGGER'),
  retryFailedTargetHandler,
);

export default router;
