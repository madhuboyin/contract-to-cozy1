// apps/backend/src/routes/releaseGate.routes.ts
//
// Admin-protected release gate API.
// Mounted at /api/admin/release-gates (requires ADMIN role).

import { Router, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { getReleaseSummary, checkGate } from '../services/releaseGate.service';
import { AuthRequest } from '../types/auth.types';
import { UserRole } from '../types/auth.types';
import { logger } from '../lib/logger';

const router = Router();

/**
 * GET /api/admin/release-gates
 * Returns a full release gate summary across all registered tools.
 * Requires: ADMIN role
 */
router.get(
  '/',
  authenticate,
  requireRole(UserRole.ADMIN),
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const summary = await getReleaseSummary();
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err) {
      logger.error('[ReleaseGate] GET / error:', err);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve release gate summary',
          code: 'RELEASE_GATE_ERROR',
        },
      });
    }
  }
);

/**
 * GET /api/admin/release-gates/:toolKey
 * Returns the release gate result for a specific tool.
 * Requires: ADMIN role
 */
router.get(
  '/:toolKey',
  authenticate,
  requireRole(UserRole.ADMIN),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { toolKey } = req.params;
      const result = await checkGate(toolKey);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      logger.error('[ReleaseGate] GET /:toolKey error:', err);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve release gate for tool',
          code: 'RELEASE_GATE_ERROR',
        },
      });
    }
  }
);

export default router;
