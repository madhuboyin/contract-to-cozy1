import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import type { CustomRequest } from '../types';
import { PropertySaleCaseService } from '../services/propertySaleCase.service';

const router = Router();

const targetDatesSchema = z.object({
  targetListDate: z.string().datetime().nullable().optional(),
  targetCloseDate: z.string().datetime().nullable().optional(),
}).refine(
  (value) => value.targetListDate !== undefined || value.targetCloseDate !== undefined,
  'At least one target date is required.',
);

const transitionStatusSchema = z.object({
  status: z.enum(['LISTED', 'UNDER_CONTRACT', 'CLOSED', 'CANCELLED']),
});

const itemDecisionSchema = z.object({
  action: z.enum(['WAIVE', 'REOPEN']),
  reason: z.string().trim().max(500).optional(),
});

const recordTransitionSchema = z.object({
  effectiveAt: z.string().datetime().nullable().optional(),
  sellerRetentionDecision: z.string().trim().max(500).nullable().optional(),
  buyerPackageId: z.string().uuid().nullable().optional(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error(result.error.issues.map((issue) => issue.message).join('; ')) as Error & {
      statusCode?: number;
      code?: string;
    };
    error.statusCode = 400;
    error.code = 'SALE_CASE_INPUT_INVALID';
    throw error;
  }
  return result.data;
}

router.use(apiRateLimiter);
router.use(authenticate);
router.use('/properties/:propertyId/sale-case', propertyAuthMiddleware);

router.get('/properties/:propertyId/sale-case', async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    const result = await PropertySaleCaseService.getCase(req.user!.userId, req.params.propertyId);
    return res.json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/properties/:propertyId/sale-case',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const saleCase = await PropertySaleCaseService.createCase(req.user!.userId, req.params.propertyId);
      return res.status(201).json({ success: true, data: { saleCase } });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/properties/:propertyId/sale-case/dates',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(targetDatesSchema, req.body ?? {});
      const saleCase = await PropertySaleCaseService.updateTargetDates(req.user!.userId, req.params.propertyId, {
        targetListDate: input.targetListDate === undefined ? undefined : input.targetListDate ? new Date(input.targetListDate) : null,
        targetCloseDate: input.targetCloseDate === undefined ? undefined : input.targetCloseDate ? new Date(input.targetCloseDate) : null,
      });
      return res.json({ success: true, data: { saleCase } });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/properties/:propertyId/sale-case/status',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(transitionStatusSchema, req.body);
      const saleCase = await PropertySaleCaseService.transitionStatus(req.user!.userId, req.params.propertyId, input.status);
      return res.json({ success: true, data: { saleCase } });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/properties/:propertyId/sale-case/items/:itemId',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(itemDecisionSchema, req.body);
      const item = await PropertySaleCaseService.setItemDecision(
        req.user!.userId,
        req.params.propertyId,
        req.params.itemId,
        input.action,
        input.reason,
      );
      return res.json({ success: true, data: { item } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/sale-case/transitions',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(recordTransitionSchema, req.body ?? {});
      const transition = await PropertySaleCaseService.recordTransition(req.user!.userId, req.params.propertyId, {
        effectiveAt: input.effectiveAt === undefined ? undefined : input.effectiveAt ? new Date(input.effectiveAt) : null,
        sellerRetentionDecision: input.sellerRetentionDecision,
        buyerPackageId: input.buyerPackageId,
      });
      return res.status(201).json({ success: true, data: { transition } });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
