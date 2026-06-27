import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { requireRole } from '../middleware/householdRole.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

import {
  listMembers,
  getMyMembership,
  updateMember,
  removeMember,
  updateMyNotificationPrefs,
  sendInvite,
  listInvites,
  revokeInvite,
  previewInvite,
  acceptInvite,
  getActivityFeed,
  assignTask,
} from '../controllers/household.controller';

import {
  SendInviteSchema,
  UpdateMemberRoleSchema,
  UpdateNotificationPrefsSchema,
  AssignTaskSchema,
} from '../validators/household.validators';

const router = Router();

router.use(apiRateLimiter);

// ── Public invite endpoints (no propertyAuth) ─────────────────────────────────

router.get('/household/invites/:token', previewInvite);

router.post('/household/invites/:token/accept', authenticate, acceptInvite);

// ── Property-scoped endpoints ─────────────────────────────────────────────────

router.use(authenticate);

// Members
router.get(
  '/properties/:propertyId/household/members',
  propertyAuthMiddleware,
  listMembers
);

router.get(
  '/properties/:propertyId/household/members/me',
  propertyAuthMiddleware,
  getMyMembership
);

router.patch(
  '/properties/:propertyId/household/members/me/notifications',
  propertyAuthMiddleware,
  validateBody(UpdateNotificationPrefsSchema),
  updateMyNotificationPrefs
);

router.patch(
  '/properties/:propertyId/household/members/:memberId',
  propertyAuthMiddleware,
  requireRole('OWNER'),
  validateBody(UpdateMemberRoleSchema),
  updateMember
);

router.delete(
  '/properties/:propertyId/household/members/:memberId',
  propertyAuthMiddleware,
  requireRole('OWNER'),
  removeMember
);

// Invites (OWNER only)
router.get(
  '/properties/:propertyId/household/invites',
  propertyAuthMiddleware,
  requireRole('OWNER'),
  listInvites
);

router.post(
  '/properties/:propertyId/household/invites',
  propertyAuthMiddleware,
  requireRole('OWNER'),
  validateBody(SendInviteSchema),
  sendInvite
);

router.delete(
  '/properties/:propertyId/household/invites/:inviteId',
  propertyAuthMiddleware,
  requireRole('OWNER'),
  revokeInvite
);

// Activity feed
router.get(
  '/properties/:propertyId/household/activity',
  propertyAuthMiddleware,
  getActivityFeed
);

// Task assignment (CONTRIBUTOR or OWNER)
router.patch(
  '/properties/:propertyId/tasks/:taskId/assign',
  propertyAuthMiddleware,
  requireRole('CONTRIBUTOR'),
  validateBody(AssignTaskSchema),
  assignTask
);

export default router;
