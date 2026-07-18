// apps/backend/src/routes/adminWorkQueues.routes.ts
//
// Operational work-queues overview API (ADMIN_MODULE_FRD.md Phase 2 slice).
// Counts only; baseline ADMIN_DASHBOARD_VIEW — each linked workspace
// enforces its own capability.

import { Router } from 'express';
import { Response } from 'express';
import { UserRole, AuthRequest } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { logger } from '../lib/logger';
import { getWorkQueues } from '../services/adminWorkQueues.service';

const router = Router();

router.use('/admin/work-queues', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/work-queues:
 *   get:
 *     summary: Aggregate counts of every actionable admin work queue
 *     tags: [Admin Work Queues]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/admin/work-queues',
  requireCapability('ADMIN_DASHBOARD_VIEW'),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await getWorkQueues();
      res.json({ success: true, data: result });
    } catch (err: any) {
      logger.error({ err }, '[ADMIN-WORK-QUEUES] Failed to load work queues');
      res.status(500).json({ success: false, error: { message: 'Failed to load work queues' } });
    }
  }
);

export default router;
