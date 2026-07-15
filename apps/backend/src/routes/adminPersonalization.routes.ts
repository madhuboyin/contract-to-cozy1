// apps/backend/src/routes/adminPersonalization.routes.ts
//
// Admin-only personalization engine controls (kill switch).
// All routes protected by authenticate + requireMfa + requireRole(ADMIN).

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import {
  getKillSwitchHandler,
  pauseKillSwitchHandler,
  resumeKillSwitchHandler,
  pauseDefinitionHandler,
  resumeDefinitionHandler,
  getCatalogHandler,
  getPersonalizationQualityHandler,
  activateDefinitionBundleHandler,
  activateQuestionHandler,
} from '../controllers/adminPersonalization.controller';

const router = Router();

router.use('/admin/personalization', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/personalization/kill-switch:
 *   get:
 *     summary: Get personalization engine kill switch state
 *     tags: [Admin Personalization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current kill switch state
 */
router.get('/admin/personalization/kill-switch', getKillSwitchHandler);

/**
 * @swagger
 * /api/admin/personalization/kill-switch/pause:
 *   post:
 *     summary: Emergency-pause personalization engine evaluation system-wide
 *     tags: [Admin Personalization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Kill switch paused
 *       400:
 *         description: Missing reason
 */
router.post('/admin/personalization/kill-switch/pause', pauseKillSwitchHandler);

/**
 * @swagger
 * /api/admin/personalization/kill-switch/resume:
 *   post:
 *     summary: Resume personalization engine evaluation system-wide
 *     tags: [Admin Personalization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kill switch resumed
 */
router.post('/admin/personalization/kill-switch/resume', resumeKillSwitchHandler);

router.post('/admin/personalization/definitions/:code/pause', pauseDefinitionHandler);
router.post('/admin/personalization/definitions/:code/resume', resumeDefinitionHandler);
router.get('/admin/personalization/catalog', getCatalogHandler);
router.get('/admin/personalization/quality', getPersonalizationQualityHandler);
router.post('/admin/personalization/definitions/:code/activate', activateDefinitionBundleHandler);
router.post('/admin/personalization/questions/:code/activate', activateQuestionHandler);

export default router;
