// apps/backend/src/routes/costVolatility.routes.ts
import { Router } from 'express';
import { z } from 'zod';

import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate } from '../middleware/validate.middleware';

import { getCostVolatility } from '../controllers/costVolatility.controller';

const router = Router();

const schema = z.object({
  query: z.object({
    years: z.union([z.literal('5'), z.literal('10')]).optional(),
  }),
});

/**
 * GET /api/properties/:propertyId/tools/cost-volatility?years=5
 */
router.get(
  '/properties/:propertyId/tools/cost-volatility',
  authenticate,
  restrictToHomeowner,
  apiRateLimiter,
  propertyAuthMiddleware,
  validate(schema),
  getCostVolatility
);

export default router;
