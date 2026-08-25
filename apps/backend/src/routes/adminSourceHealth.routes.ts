// apps/backend/src/routes/adminSourceHealth.routes.ts
//
// Home Intelligence Functional Completeness FRD Phase 7 (HI-SRC-002).
// Reuses WORKER_JOB_VIEW — the same read-only operational-visibility
// capability adminIntelligenceRecompute.routes.ts uses for its refresh
// -state read — rather than declaring a new capability for one endpoint.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { getSourceHealthHandler } from '../controllers/adminSourceHealth.controller';

const router = Router();

router.use('/admin/source-health', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/source-health:
 *   get:
 *     summary: Unified read-only source-health projection across Home Event Radar and Service Price Benchmark sources — admin-only
 *     tags: [Admin Source Health]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/source-health', requireCapability('WORKER_JOB_VIEW'), getSourceHealthHandler);

export default router;
