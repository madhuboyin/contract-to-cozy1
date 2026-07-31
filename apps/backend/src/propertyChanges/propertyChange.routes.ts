import { NextFunction, Response, Router } from 'express';
import { z } from 'zod';
import { requireCapability } from '../middleware/adminCapability.middleware';
import {
  authenticate,
  requireMfa,
  requireRole,
} from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { CustomRequest } from '../types';
import { UserRole } from '../types/auth.types';
import { propertyChangeDismissSchema } from './propertyChange.contracts';
import {
  dismissPropertyChange,
  inspectPropertyChanges,
  linkCanonicalActionToChange,
  listPropertyChanges,
  markPropertyChangeSeen,
} from './propertyChange.service';

const router = Router();
router.use(apiRateLimiter);

function authenticatedUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw Object.assign(new Error('Authentication required.'), {
      statusCode: 401,
      code: 'AUTH_REQUIRED',
    });
  }
  return userId;
}

router.get(
  '/properties/:propertyId/changes',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const unseenOnly = req.query.unseenOnly === 'true';
      return res.json({
        success: true,
        data: await listPropertyChanges({
          propertyId: req.params.propertyId,
          userId: authenticatedUserId(req),
          unseenOnly,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/changes/:changeId/seen',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      return res.json({
        success: true,
        data: await markPropertyChangeSeen({
          propertyId: req.params.propertyId,
          changeId: req.params.changeId,
          userId: authenticatedUserId(req),
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/changes/:changeId/dismiss',
  authenticate,
  propertyAuthMiddleware,
  validateBody(propertyChangeDismissSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      return res.json({
        success: true,
        data: await dismissPropertyChange({
          propertyId: req.params.propertyId,
          changeId: req.params.changeId,
          userId: authenticatedUserId(req),
          reason: req.body.reason,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

const adminGuard = [
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('INTEGRATION_MANAGE'),
] as const;

const inspectionQuerySchema = z.object({
  propertyId: z.string().uuid().optional(),
  sourceType: z.string().trim().min(2).max(120).optional(),
  sourceEntityId: z.string().trim().min(1).max(300).optional(),
});

router.get(
  '/admin/property-changes/inspect',
  ...adminGuard,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = inspectionQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid property change inspection query.',
            details: parsed.error.issues,
          },
        });
      }
      return res.json({
        success: true,
        data: await inspectPropertyChanges(parsed.data),
      });
    } catch (error) {
      return next(error);
    }
  },
);

const actionLinkSchema = z.object({
  propertyId: z.string().uuid(),
  canonicalActionId: z.string().uuid(),
});

router.put(
  '/admin/property-changes/:changeId/canonical-action',
  ...adminGuard,
  validateBody(actionLinkSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      return res.json({
        success: true,
        data: await linkCanonicalActionToChange({
          changeId: req.params.changeId,
          propertyId: req.body.propertyId,
          canonicalActionId: req.body.canonicalActionId,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
