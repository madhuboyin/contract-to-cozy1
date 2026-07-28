import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import type { CustomRequest } from '../types';
import { UserRole } from '../types/auth.types';
import { getOwnershipCostLaunchGate } from '../services/ownershipCosts/ownershipCostLaunchGate.service';
import { ownershipCostOperationsService } from '../services/ownershipCosts/ownershipCostOperations.service';

const router = Router();

const dashboardQuery = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).default(30),
}).strict();

const replayBody = z.object({
  propertyId: z.string().trim().min(1).max(160),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  methodVersion: z.string().trim().min(1).max(120),
}).strict();

function handler(
  fn: (req: CustomRequest, res: Response) => Promise<unknown>,
) {
  return (req: CustomRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

router.get(
  '/admin/ownership-costs/operations',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('ANALYTICS_VIEW'),
  handler(async (req, res) => {
    const parsed = dashboardQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid ownership-cost operations query.',
        errors: parsed.error.issues,
      });
      return;
    }
    res.json({
      success: true,
      data: await ownershipCostOperationsService.dashboard(
        parsed.data.windowDays,
      ),
    });
  }),
);

router.post(
  '/admin/ownership-costs/replay',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('AUDIT_VIEW'),
  handler(async (req, res) => {
    const parsed = replayBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid ownership-cost replay request.',
        errors: parsed.error.issues,
      });
      return;
    }
    res.json({
      success: true,
      data: await ownershipCostOperationsService.replay(parsed.data),
    });
  }),
);

router.get(
  '/admin/ownership-costs/launch-gate',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('RELEASE_GATE_VIEW'),
  handler(async (_req, res) => {
    res.json({ success: true, data: await getOwnershipCostLaunchGate() });
  }),
);

export default router;
