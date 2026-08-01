// apps/backend/src/routes/adminHomeOperations.routes.ts
//
// Item #24 (§15 "Admin tooling can inspect one work item's full source/
// execution/outcome graph"). Read-only. Reuses PROPERTY_SUPPORT_VIEW — an
// existing capability already declared in adminCapabilities.ts and assigned
// to a persona bundle, with no route consumer before this one.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { getAdminWorkItemDetailHandler } from '../controllers/adminHomeOperations.controller';

const router = Router();

router.use('/admin/home-operations', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/home-operations/work-items/{workItemId}:
 *   get:
 *     summary: Full Home Operations work-item graph (sources, executions, evidence, watchers, event history) — admin-only, property-agnostic
 *     tags: [Admin Home Operations]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/admin/home-operations/work-items/:workItemId',
  requireCapability('PROPERTY_SUPPORT_VIEW'),
  getAdminWorkItemDetailHandler,
);

export default router;
