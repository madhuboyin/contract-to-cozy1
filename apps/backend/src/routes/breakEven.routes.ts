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
    homeValueNow: z.string().optional(),
    appreciationRate: z.string().optional(),
    expenseGrowthRate: z.string().optional(),
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
