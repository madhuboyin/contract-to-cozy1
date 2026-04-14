// apps/backend/src/routes/adminWorkerJobs.routes.ts
//
// Admin-only worker jobs API.
// All routes protected by authenticate + requireRole(ADMIN).

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { getWorkerJobsHandler, triggerJobHandler } from '../controllers/adminWorkerJobs.controller';

const router = Router();

router.use(apiRateLimiter);
router.use('/admin/worker-jobs', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/worker-jobs:
 *   get:
 *     summary: List all worker jobs with live queue stats
 *     tags: [Admin Worker Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job registry with BullMQ queue stats and recent runs
 */
router.get('/admin/worker-jobs', getWorkerJobsHandler);

/**
 * @swagger
 * /api/admin/worker-jobs/{jobKey}/trigger:
 *   post:
 *     summary: Manually trigger a BullMQ-backed job
 *     tags: [Admin Worker Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Job key from the registry (e.g. recall-ingest)
 *     responses:
 *       200:
 *         description: Job enqueued successfully
 *       400:
 *         description: Trigger not supported for this job
 */
router.post('/admin/worker-jobs/:jobKey/trigger', triggerJobHandler);

export default router;
