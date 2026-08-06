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

const retentionDecisionSchema = z.enum(['RETAIN_PRIVATE_ONLY', 'SHARE_SELECTED_HISTORY']);

const budgetRangeSchema = z.object({
  budgetRange: z.enum(['UNDER_5K', 'FIVE_TO_15K', 'FIFTEEN_TO_30K', 'OVER_30K']).nullable(),
});

const confirmNotableUpgradesSchema = z.object({
  keys: z.array(z.string().min(1)).max(50),
});

const recordTransitionSchema = z.object({
  effectiveAt: z.string().datetime().nullable().optional(),
  sellerRetentionDecision: retentionDecisionSchema.nullable().optional(),
  sellerRetentionNotes: z.string().trim().max(1000).nullable().optional(),
  buyerPackageId: z.string().uuid().nullable().optional(),
});

const updateTransitionSchema = recordTransitionSchema;

const completeTransitionSchema = z.object({
  revokeShareIds: z.array(z.string().uuid()).max(20).optional(),
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
        sellerRetentionNotes: input.sellerRetentionNotes,
        buyerPackageId: input.buyerPackageId,
      });
      return res.status(201).json({ success: true, data: { transition } });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/properties/:propertyId/sale-case/transitions/:transitionId',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(updateTransitionSchema, req.body ?? {});
      const transition = await PropertySaleCaseService.updateTransition(
        req.user!.userId,
        req.params.propertyId,
        req.params.transitionId,
        {
          effectiveAt: input.effectiveAt === undefined ? undefined : input.effectiveAt ? new Date(input.effectiveAt) : null,
          sellerRetentionDecision: input.sellerRetentionDecision,
          sellerRetentionNotes: input.sellerRetentionNotes,
          buyerPackageId: input.buyerPackageId,
        },
      );
      return res.json({ success: true, data: { transition } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/sale-case/transitions/:transitionId/complete',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(completeTransitionSchema, req.body ?? {});
      const result = await PropertySaleCaseService.completeTransition(
        req.user!.userId,
        req.params.propertyId,
        req.params.transitionId,
        { revokeShareIds: input.revokeShareIds },
      );
      return res.json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/properties/:propertyId/sale-case/entry-flow',
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const result = await PropertySaleCaseService.getEntryFlowStatus(req.user!.userId, req.params.propertyId);
      return res.json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/properties/:propertyId/sale-case/prep-questions',
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const result = await PropertySaleCaseService.getSalePrepQuestionStatus(req.user!.userId, req.params.propertyId);
      return res.json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/properties/:propertyId/sale-case/budget',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(budgetRangeSchema, req.body ?? {});
      const saleCase = await PropertySaleCaseService.updateBudgetRange(
        req.user!.userId,
        req.params.propertyId,
        input.budgetRange,
      );
      return res.json({ success: true, data: { saleCase } });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/properties/:propertyId/sale-case/notable-upgrades',
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const result = await PropertySaleCaseService.getNotableUpgradeCandidates(req.user!.userId, req.params.propertyId);
      return res.json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/sale-case/notable-upgrades/confirm',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(confirmNotableUpgradesSchema, req.body ?? {});
      const result = await PropertySaleCaseService.confirmNotableUpgrades(
        req.user!.userId,
        req.params.propertyId,
        input.keys,
      );
      return res.json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
