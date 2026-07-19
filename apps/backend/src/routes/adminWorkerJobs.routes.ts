// apps/backend/src/routes/adminWorkerJobs.routes.ts
//
// Admin-only worker jobs API.
// All routes protected by authenticate + requireRole(ADMIN).

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { getWorkerJobsHandler, triggerJobHandler, getWorkerGovernanceHandler } from '../controllers/adminWorkerJobs.controller';

const router = Router();

router.use('/admin/worker-jobs', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/worker-jobs/governance:
 *   get:
 *     summary: Worker execution-policy flag state (WORKER_AUTOMATION_ENABLED, etc), ENFORCE_HUMAN_POLICY_APPROVALS, and runner/poller effective-enabled status
 *     tags: [Admin Worker Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Effective worker governance flags and runner status
 */
router.get('/admin/worker-jobs/governance', requireCapability('WORKER_JOB_VIEW'), getWorkerGovernanceHandler);

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
router.get('/admin/worker-jobs', requireCapability('WORKER_JOB_VIEW'), getWorkerJobsHandler);

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
router.post('/admin/worker-jobs/:jobKey/trigger', requireCapability('WORKER_JOB_TRIGGER'), triggerJobHandler);

export default router;
