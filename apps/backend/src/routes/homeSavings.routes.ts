import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  getHomeSavingsCategoryDetail,
  getHomeSavingsSummary,
  listHomeSavingsCategories,
  runHomeSavingsComparison,
  setHomeSavingsOpportunityStatus,
  upsertHomeSavingsAccount,
} from '../controllers/homeSavings.controller';
import { HOME_SAVINGS_CATEGORY_KEYS } from '../services/homeSavings/types';

const router = Router();

const categoryKeySchema = z.enum(HOME_SAVINGS_CATEGORY_KEYS);

const upsertAccountBodySchema = z.object({
  providerName: z.string().trim().min(1).nullable().optional(),
  planName: z.string().trim().min(1).nullable().optional(),
  accountNumberMasked: z.string().trim().min(1).nullable().optional(),
  billingCadence: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'OTHER']).optional(),
  amount: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  startDate: z.string().datetime().nullable().optional(),
  renewalDate: z.string().datetime().nullable().optional(),
  contractEndDate: z.string().datetime().nullable().optional(),
  usageJson: z.any().optional(),
  planDetailsJson: z.any().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'UNKNOWN']).optional(),
});

const runComparisonBodySchema = z.object({
  categoryKey: categoryKeySchema.optional(),
});

const setOpportunityStatusBodySchema = z.object({
  status: z.enum(['NEW', 'VIEWED', 'DISMISSED', 'SAVED', 'APPLIED', 'SWITCHED', 'EXPIRED']),
});

router.use(apiRateLimiter);
router.use(authenticate);

router.get('/home-savings/categories', listHomeSavingsCategories);

router.get('/properties/:propertyId/home-savings/summary', propertyAuthMiddleware, getHomeSavingsSummary);

router.get('/properties/:propertyId/home-savings/:categoryKey', propertyAuthMiddleware, getHomeSavingsCategoryDetail);

router.post(
  '/properties/:propertyId/home-savings/:categoryKey/account',
  propertyAuthMiddleware,
  validateBody(upsertAccountBodySchema),
  upsertHomeSavingsAccount
);

router.post(
  '/properties/:propertyId/home-savings/run',
  propertyAuthMiddleware,
  validateBody(runComparisonBodySchema),
  runHomeSavingsComparison
);

router.post(
  '/home-savings/opportunities/:id/status',
  validateBody(setOpportunityStatusBodySchema),
  setHomeSavingsOpportunityStatus
);

export default router;
