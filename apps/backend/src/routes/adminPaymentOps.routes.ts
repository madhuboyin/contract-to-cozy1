// apps/backend/src/routes/adminPaymentOps.routes.ts
//
// Payment Operations API (ADMIN_MODULE_FRD.md §10.4, Phase 3 slice).
// Local-ledger reads under PAYMENT_VIEW; refund requests under
// REFUND_REQUEST; two-person decisions under REFUND_APPROVE. No refund
// execution — record-and-govern only until a payment-provider integration
// exists.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  CreateRefundRequestBodySchema,
  DecideRefundRequestBodySchema,
  ListPaymentsQuerySchema,
  ListRefundRequestsQuerySchema,
} from '../validators/adminPaymentOps.validators';
import {
  createRefundRequestHandler,
  decideRefundRequestHandler,
  getPaymentDetailHandler,
  listPaymentsHandler,
  listRefundRequestsHandler,
} from '../controllers/adminPaymentOps.controller';

const router = Router();

router.use('/admin/payments', authenticate, requireMfa, requireRole(UserRole.ADMIN));
router.use('/admin/refund-requests', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/payments:
 *   get:
 *     summary: Payment search (booking number / payment-intent id, status) with local-ledger summary
 *     tags: [Admin Payment Operations]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/payments', requireCapability('PAYMENT_VIEW'), validate(ListPaymentsQuerySchema), listPaymentsHandler);

/**
 * @swagger
 * /api/admin/payments/{paymentId}:
 *   get:
 *     summary: Payment detail with booking context and refund request history
 *     tags: [Admin Payment Operations]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/payments/:paymentId', requireCapability('PAYMENT_VIEW'), getPaymentDetailHandler);

/**
 * @swagger
 * /api/admin/payments/{paymentId}/refund-requests:
 *   post:
 *     summary: Open a refund request (amount, reason, policy basis)
 *     tags: [Admin Payment Operations]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/payments/:paymentId/refund-requests',
  requireCapability('REFUND_REQUEST'),
  validateBody(CreateRefundRequestBodySchema),
  createRefundRequestHandler
);

/**
 * @swagger
 * /api/admin/refund-requests:
 *   get:
 *     summary: Refund request queue (defaults to pending approval, oldest first)
 *     tags: [Admin Payment Operations]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/admin/refund-requests',
  requireCapability('PAYMENT_VIEW'),
  validate(ListRefundRequestsQuerySchema),
  listRefundRequestsHandler
);

/**
 * @swagger
 * /api/admin/refund-requests/{requestId}/decide:
 *   post:
 *     summary: Approve or reject a refund request (requester cannot decide their own)
 *     tags: [Admin Payment Operations]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/refund-requests/:requestId/decide',
  requireCapability('REFUND_APPROVE'),
  validateBody(DecideRefundRequestBodySchema),
  decideRefundRequestHandler
);

export default router;
