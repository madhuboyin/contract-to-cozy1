// apps/backend/src/routes/costExplainer.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate } from '../middleware/validate.middleware'; // adjust if your middleware exports differently
import { z } from 'zod';
import { getCostExplainer } from '../controllers/costExplainer.controller';

const router = Router();

const querySchema = z.object({
  years: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 5))
    .refine((v) => v === 5 || v === 10, 'years must be 5 or 10'),
});

router.get(
  '/properties/:propertyId/tools/cost-explainer',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  validate(querySchema),
  getCostExplainer
);

export default router;
