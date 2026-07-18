// apps/backend/src/routes/adminSearch.routes.ts
//
// Global admin search API (ADMIN_MODULE_FRD.md §17 Phase 1). Baseline
// ADMIN_DASHBOARD_VIEW gate — the service itself only searches domains the
// actor holds view capabilities for.

import { Router, Response } from 'express';
import { z } from 'zod';
import { UserRole, AuthRequest } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validate } from '../middleware/validate.middleware';
import { logger } from '../lib/logger';
import { globalSearch } from '../services/adminSearch.service';

const router = Router();

router.use('/admin/search', authenticate, requireMfa, requireRole(UserRole.ADMIN));

const SearchQuerySchema = z.object({
  query: z.object({
    q: z.string().min(1).max(200),
  }),
});

/**
 * @swagger
 * /api/admin/search:
 *   get:
 *     summary: Global search across the admin domains the actor can view
 *     tags: [Admin Search]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/admin/search',
  requireCapability('ADMIN_DASHBOARD_VIEW'),
  validate(SearchQuerySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const results = await globalSearch(req.user!.userId, String(req.query.q));
      res.json({ success: true, data: results });
    } catch (err: any) {
      logger.error({ err }, '[ADMIN-SEARCH] Failed to search');
      res.status(500).json({ success: false, error: { message: 'Search failed' } });
    }
  }
);

export default router;
