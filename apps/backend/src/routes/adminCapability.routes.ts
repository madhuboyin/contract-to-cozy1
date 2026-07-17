// apps/backend/src/routes/adminCapability.routes.ts
//
// Admin capability grant/revoke API (ADMIN_MODULE_FRD.md §8.2/§8.3, Phase 0).
// Gated by ADMIN_ROLE_MANAGE — the capability that governs who can change
// other admins' capabilities. Self-grant is blocked in the service layer.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  GrantCapabilityBodySchema,
  RevokeCapabilityBodySchema,
} from '../validators/adminCapability.validators';
import {
  getCapabilityCatalogHandler,
  grantUserCapabilityHandler,
  listUserGrantsHandler,
  revokeUserCapabilityHandler,
} from '../controllers/adminCapability.controller';

const router = Router();

router.use(
  '/admin/capabilities',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('ADMIN_ROLE_MANAGE')
);

/**
 * @swagger
 * /api/admin/capabilities/catalog:
 *   get:
 *     summary: List the capability catalog and persona bundles
 *     tags: [Admin Capabilities]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Capability list with risk levels, and persona bundle definitions
 */
router.get('/admin/capabilities/catalog', getCapabilityCatalogHandler);

/**
 * @swagger
 * /api/admin/capabilities/users/{userId}:
 *   get:
 *     summary: List a user's capability grant history (active + revoked)
 *     tags: [Admin Capabilities]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/capabilities/users/:userId', listUserGrantsHandler);

/**
 * @swagger
 * /api/admin/capabilities/users/{userId}/grant:
 *   post:
 *     summary: Grant a capability or persona bundle to a user
 *     tags: [Admin Capabilities]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/capabilities/users/:userId/grant',
  validateBody(GrantCapabilityBodySchema),
  grantUserCapabilityHandler
);

/**
 * @swagger
 * /api/admin/capabilities/users/{userId}/revoke:
 *   post:
 *     summary: Revoke an active capability grant from a user
 *     tags: [Admin Capabilities]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/capabilities/users/:userId/revoke',
  validateBody(RevokeCapabilityBodySchema),
  revokeUserCapabilityHandler
);

export default router;
