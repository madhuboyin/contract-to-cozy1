// apps/backend/src/routes/adminContentGovernance.routes.ts
//
// Knowledge editorial lifecycle API (ADMIN_MODULE_FRD.md §10.6, Phase 4
// slice). Three transition endpoints, one per separated capability, plus
// the Pending Reviews queues. The generic article upsert
// (knowledgeHubAdmin.routes.ts) can no longer change lifecycle state.

import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  getEditorialQueuesHandler,
  makeTransitionHandler,
} from '../controllers/adminContentGovernance.controller';

const router = Router();

router.use('/admin/content/knowledge', authenticate, requireMfa, requireRole(UserRole.ADMIN));

const AuthorActionBodySchema = z.object({
  action: z.enum(['SUBMIT_FOR_REVIEW', 'REVIVE_TO_DRAFT']),
  reason: z.string().min(1, 'reason is required').max(2000),
});

const ReviewDecisionBodySchema = z.object({
  action: z.enum(['APPROVE', 'RETURN_TO_DRAFT']),
  reason: z.string().min(1, 'reason is required').max(2000),
});

const PublishActionBodySchema = z.object({
  action: z.enum(['PUBLISH', 'UNPUBLISH', 'ARCHIVE']),
  reason: z.string().min(1, 'reason is required').max(2000),
});

/**
 * @swagger
 * /api/admin/content/knowledge/queues:
 *   get:
 *     summary: Editorial queues — articles in REVIEW and APPROVED awaiting publish
 *     tags: [Admin Content Governance]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/content/knowledge/queues', requireCapability('CONTENT_AUTHOR'), getEditorialQueuesHandler);

/**
 * @swagger
 * /api/admin/content/knowledge/{articleId}/author-action:
 *   post:
 *     summary: Author lifecycle actions — submit for review, revive archived to draft
 *     tags: [Admin Content Governance]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/content/knowledge/:articleId/author-action',
  requireCapability('CONTENT_AUTHOR'),
  validateBody(AuthorActionBodySchema),
  makeTransitionHandler(['SUBMIT_FOR_REVIEW', 'REVIVE_TO_DRAFT'])
);

/**
 * @swagger
 * /api/admin/content/knowledge/{articleId}/review-decision:
 *   post:
 *     summary: Reviewer decisions — approve or return to draft
 *     tags: [Admin Content Governance]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/content/knowledge/:articleId/review-decision',
  requireCapability('CONTENT_REVIEW'),
  validateBody(ReviewDecisionBodySchema),
  makeTransitionHandler(['APPROVE', 'RETURN_TO_DRAFT'])
);

/**
 * @swagger
 * /api/admin/content/knowledge/{articleId}/publish-action:
 *   post:
 *     summary: Publisher actions — publish, unpublish, archive
 *     tags: [Admin Content Governance]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/content/knowledge/:articleId/publish-action',
  requireCapability('CONTENT_PUBLISH'),
  validateBody(PublishActionBodySchema),
  makeTransitionHandler(['PUBLISH', 'UNPUBLISH', 'ARCHIVE'])
);

export default router;
