// apps/backend/src/routes/adminReviewModeration.routes.ts
//
// Review Moderation Queue API (ADMIN_MODULE_FRD.md §10.5, Phase 2 slice).
// Admin-actor moderation surface over the Review model — entirely separate
// from the public provider-review reads in provider.routes.ts, which only
// ever expose APPROVED reviews.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  ListReviewsQuerySchema,
  ModerateReviewBodySchema,
} from '../validators/adminReviewModeration.validators';
import { RequestInvestigationBodySchema } from '../validators/adminCase.validators';
import {
  getReviewDetailHandler,
  listReviewsHandler,
  moderateReviewHandler,
  requestInvestigationHandler,
} from '../controllers/adminReviewModeration.controller';

const router = Router();

router.use('/admin/reviews', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/reviews:
 *   get:
 *     summary: Moderation queue — pending + flagged reviews by default, or filter by status
 *     tags: [Admin Review Moderation]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/reviews', requireCapability('REVIEW_MODERATE'), validate(ListReviewsQuerySchema), listReviewsHandler);

/**
 * @swagger
 * /api/admin/reviews/{reviewId}:
 *   get:
 *     summary: Moderation detail — review, booking context, author/provider history counts
 *     tags: [Admin Review Moderation]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/reviews/:reviewId', requireCapability('REVIEW_MODERATE'), getReviewDetailHandler);

/**
 * @swagger
 * /api/admin/reviews/{reviewId}/moderate:
 *   post:
 *     summary: Governed moderation decision (APPROVE/REJECT/FLAG/RESTORE) with required reason
 *     tags: [Admin Review Moderation]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/reviews/:reviewId/moderate',
  requireCapability('REVIEW_MODERATE'),
  validateBody(ModerateReviewBodySchema),
  moderateReviewHandler
);

/**
 * @swagger
 * /api/admin/reviews/{reviewId}/request-investigation:
 *   post:
 *     summary: Open a REVIEW_INVESTIGATION case linked to this review (does not change review status)
 *     tags: [Admin Review Moderation]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/reviews/:reviewId/request-investigation',
  requireCapability('REVIEW_MODERATE'),
  validateBody(RequestInvestigationBodySchema),
  requestInvestigationHandler
);

export default router;
