// apps/backend/src/routes/adminAuditExplorer.routes.ts
//
// Audit Explorer v1 (ADMIN_MODULE_FRD.md §12.2, Phase 1). Read-only.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validate } from '../middleware/validate.middleware';
import { AuditExplorerQuerySchema } from '../validators/adminAuditExplorer.validators';
import { queryAuditLogHandler } from '../controllers/adminAuditExplorer.controller';

const router = Router();

router.use(
  '/admin/audit',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('AUDIT_VIEW')
);

/**
 * @swagger
 * /api/admin/audit:
 *   get:
 *     summary: Query the admin audit log (filtered, paginated, read-only)
 *     tags: [Admin Audit Explorer]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/audit', validate(AuditExplorerQuerySchema), queryAuditLogHandler);

export default router;
