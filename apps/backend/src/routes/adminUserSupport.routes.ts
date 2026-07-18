// apps/backend/src/routes/adminUserSupport.routes.ts
//
// User/Account Support workspace API (ADMIN_MODULE_FRD.md §10.1, Phase 1).
// Entirely separate from the HOMEOWNER/PROVIDER self-service routes in
// user.routes.ts — this surface is actor-driven (an admin acting on another
// user's account), never self-service.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  ChangeStatusBodySchema,
  RevokeSessionsBodySchema,
  SearchUsersQuerySchema,
} from '../validators/adminUserSupport.validators';
import {
  changeUserStatusHandler,
  getUserSummaryHandler,
  revokeUserSessionsHandler,
  searchUsersHandler,
} from '../controllers/adminUserSupport.controller';

const router = Router();

router.use('/admin/users', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Search users by email or name
 *     tags: [Admin User Support]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/users', requireCapability('USER_VIEW'), validate(SearchUsersQuerySchema), searchUsersHandler);

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   get:
 *     summary: Support-safe account summary for a single user
 *     tags: [Admin User Support]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/users/:userId', requireCapability('USER_VIEW'), getUserSummaryHandler);

/**
 * @swagger
 * /api/admin/users/{userId}/sessions/revoke:
 *   post:
 *     summary: Revoke all active refresh sessions for a user and bump their tokenVersion
 *     tags: [Admin User Support]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/users/:userId/sessions/revoke',
  requireCapability('USER_SESSION_REVOKE'),
  validateBody(RevokeSessionsBodySchema),
  revokeUserSessionsHandler
);

/**
 * @swagger
 * /api/admin/users/{userId}/status:
 *   post:
 *     summary: Governed account status transition (ACTIVE/SUSPENDED/INACTIVE)
 *     tags: [Admin User Support]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/users/:userId/status',
  requireCapability('USER_STATUS_CHANGE'),
  validateBody(ChangeStatusBodySchema),
  changeUserStatusHandler
);

export default router;
