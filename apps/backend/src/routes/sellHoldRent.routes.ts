// apps/backend/src/routes/sellHoldRent.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate } from '../middleware/validate.middleware';
import { getSellHoldRent } from '../controllers/sellHoldRent.controller';

const router = Router();

const querySchema = z.object({
  body: z.any().optional(),
  params: z.object({
    propertyId: z.string().min(1),
  }),
  query: z.object({
    years: z.union([z.literal('5'), z.literal('10')]).optional(),

    homeValueNow: z.coerce.number().positive().optional(),
    appreciationRate: z.coerce.number().min(0).max(0.2).optional(),
    sellingCostRate: z.coerce.number().min(0).max(0.2).optional(),

    monthlyRentNow: z.coerce.number().min(0).optional(),
    rentGrowthRate: z.coerce.number().min(0).max(0.2).optional(),
    vacancyRate: z.coerce.number().min(0).max(0.5).optional(),
    managementRate: z.coerce.number().min(0).max(0.5).optional(),
  }),
});

/**
 * GET /api/properties/:propertyId/tools/sell-hold-rent?years=5
 */
router.get(
  '/properties/:propertyId/tools/sell-hold-rent',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  validate(querySchema),
  getSellHoldRent
);

export default router;
