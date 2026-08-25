// apps/backend/src/routes/adminFeedbackQuality.routes.ts
//
// Home Intelligence Functional Completeness FRD Phase 7 (HI-FBK-005).
// Reuses ANALYTICS_VIEW — the same capability adminAnalytics.routes.ts's
// route group already requires — rather than declaring a new capability
// for one read endpoint.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { getFeedbackQualityHandler } from '../controllers/adminFeedbackQuality.controller';

const router = Router();

router.use('/admin/feedback-quality', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/feedback-quality:
 *   get:
 *     summary: Typed-feedback usefulness and reason-code aggregate by target type — admin-only
 *     tags: [Admin Feedback Quality]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/feedback-quality', requireCapability('ANALYTICS_VIEW'), getFeedbackQualityHandler);

export default router;
