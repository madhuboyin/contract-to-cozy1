// apps/backend/src/routes/breakEven.routes.ts
import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate } from '../middleware/validate.middleware';

import { getBreakEven } from '../controllers/breakEven.controller';

const router = Router();

const BreakEvenQuerySchema = z.object({
  params: z.object({
    propertyId: z.string().min(1),
  }),
  query: z.object({
    years: z.union([z.literal('5'), z.literal('10'), z.literal('20'), z.literal('30')]).optional(),
    assumptionSetId: z.string().uuid().optional(),
    homeValueNow: z.string().optional(),
    appreciationRate: z.string().optional(),
    expenseGrowthRate: z.string().optional(),
    inflationRate: z.string().optional(),
    rentGrowthRate: z.string().optional(),
    interestRate: z.string().optional(),
    propertyTaxGrowthRate: z.string().optional(),
    insuranceGrowthRate: z.string().optional(),
    maintenanceGrowthRate: z.string().optional(),
    sellingCostPercent: z.string().optional(),
  }),
  body: z.any().optional(),
});

router.get(
  '/properties/:propertyId/tools/break-even',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  validate(BreakEvenQuerySchema),
  getBreakEven
);

export default router;
