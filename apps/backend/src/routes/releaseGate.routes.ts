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
import { z } from 'zod';
import { requireCapability } from '../middleware/adminCapability.middleware';
import {
  CapabilityGovernanceReviewError,
  recordCapabilityGovernanceReview,
} from '../services/capabilityGovernanceReview.service';
import { RECOMMENDATION_REVIEW_ROLES } from '../productFramework/recommendationLaunchGate';

const router = Router();
const capabilityIdSchema = z.string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
const governanceReviewSchema = z.object({
  role: z.enum(RECOMMENDATION_REVIEW_ROLES),
  decision: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().trim().min(1).max(2000).nullable().optional(),
}).strict();

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
      logger.error({ err }, '[ReleaseGate] GET / error');
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

router.post(
  '/capabilities/:capabilityId/governance-reviews',
  requireCapability('SYSTEM_SETTINGS_MANAGE'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const capabilityId = capabilityIdSchema.safeParse(req.params.capabilityId);
    const body = governanceReviewSchema.safeParse(req.body);
    if (!capabilityId.success || !body.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CAPABILITY_GOVERNANCE_REVIEW',
          message: 'A canonical capability ID, required role, and decision are required.',
        },
      });
      return;
    }
    try {
      const data = await recordCapabilityGovernanceReview({
        capabilityId: capabilityId.data,
        reviewerUserId: req.user!.userId,
        ...body.data,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      if (error instanceof CapabilityGovernanceReviewError) {
        res.status(error.code === 'CAPABILITY_NOT_FOUND' ? 404 : 409).json({
          success: false,
          error: {
            code: error.code,
            message: error.code === 'CAPABILITY_NOT_FOUND'
              ? 'Capability not found.'
              : 'The selected role is not required by the current capability policy.',
            details: error.details,
          },
        });
        return;
      }
      logger.error(
        { err: error, capabilityId: capabilityId.data },
        '[ReleaseGate] Failed to record capability governance review',
      );
      res.status(500).json({
        success: false,
        error: {
          code: 'CAPABILITY_GOVERNANCE_REVIEW_ERROR',
          message: 'Failed to record capability governance review.',
        },
      });
    }
  },
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
      logger.error({ err }, '[ReleaseGate] GET /:toolKey error');
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
