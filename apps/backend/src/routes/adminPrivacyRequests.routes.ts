// apps/backend/src/routes/adminPrivacyRequests.routes.ts
//
// Subject-rights privacy request API (ADMIN_MODULE_FRD.md §11.4, Phase 3
// slice). Entirely under PRIVACY_REQUEST_MANAGE (CRITICAL risk). Tracking
// only — no data operations on the subject's account happen here.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  ChangePrivacyRequestStatusBodySchema,
  CreatePrivacyRequestBodySchema,
  ListPrivacyRequestsQuerySchema,
  SetLegalHoldBodySchema,
} from '../validators/adminPrivacyRequests.validators';
import {
  changePrivacyRequestStatusHandler,
  createPrivacyRequestHandler,
  getPrivacyRequestDetailHandler,
  listPrivacyRequestsHandler,
  setLegalHoldHandler,
} from '../controllers/adminPrivacyRequests.controller';

const router = Router();

router.use(
  '/admin/privacy-requests',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('PRIVACY_REQUEST_MANAGE')
);

/**
 * @swagger
 * /api/admin/privacy-requests:
 *   get:
 *     summary: Privacy request list — defaults to the working set, due-soonest first
 *     tags: [Admin Privacy Requests]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/privacy-requests', validate(ListPrivacyRequestsQuerySchema), listPrivacyRequestsHandler);

/**
 * @swagger
 * /api/admin/privacy-requests:
 *   post:
 *     summary: Intake a subject-rights request (email snapshot; subject may be unmatched)
 *     tags: [Admin Privacy Requests]
 *     security:
 *       - bearerAuth: []
 */
router.post('/admin/privacy-requests', validateBody(CreatePrivacyRequestBodySchema), createPrivacyRequestHandler);

/**
 * @swagger
 * /api/admin/privacy-requests/{requestId}:
 *   get:
 *     summary: Privacy request detail
 *     tags: [Admin Privacy Requests]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/privacy-requests/:requestId', getPrivacyRequestDetailHandler);

/**
 * @swagger
 * /api/admin/privacy-requests/{requestId}/status:
 *   post:
 *     summary: Governed lifecycle transition (resolution required to complete; legal hold blocks DELETION completion)
 *     tags: [Admin Privacy Requests]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/privacy-requests/:requestId/status',
  validateBody(ChangePrivacyRequestStatusBodySchema),
  changePrivacyRequestStatusHandler
);

/**
 * @swagger
 * /api/admin/privacy-requests/{requestId}/legal-hold:
 *   post:
 *     summary: Set or clear a legal hold on an open request
 *     tags: [Admin Privacy Requests]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/privacy-requests/:requestId/legal-hold',
  validateBody(SetLegalHoldBodySchema),
  setLegalHoldHandler
);

export default router;
