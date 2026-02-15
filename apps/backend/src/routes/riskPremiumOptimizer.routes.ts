import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  getRiskPremiumOptimizer,
  runRiskPremiumOptimizer,
  updateRiskPremiumPlanItem,
} from '../controllers/riskPremiumOptimizer.controller';

const router = Router();

const runBodySchema = z.object({
  overrides: z
    .object({
      annualPremium: z.number().nonnegative().optional(),
      deductibleAmount: z.number().nonnegative().optional(),
      cashBuffer: z.number().nonnegative().optional(),
      riskTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
      assumeBundled: z.boolean().optional(),
      assumeNewMitigations: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});

const updatePlanItemBodySchema = z.object({
  status: z.enum(['RECOMMENDED', 'PLANNED', 'DONE', 'SKIPPED']).optional(),
  completedAt: z.string().datetime().nullable().optional(),
  evidenceDocumentId: z.string().uuid().nullable().optional(),
  linkedHomeEventId: z.string().uuid().nullable().optional(),
});

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/risk-premium-optimizer',
  propertyAuthMiddleware,
  getRiskPremiumOptimizer
);

router.post(
  '/properties/:propertyId/risk-premium-optimizer/run',
  propertyAuthMiddleware,
  validateBody(runBodySchema),
  runRiskPremiumOptimizer
);

router.patch(
  '/properties/:propertyId/risk-premium-optimizer/plan-items/:planItemId',
  propertyAuthMiddleware,
  validateBody(updatePlanItemBodySchema),
  updateRiskPremiumPlanItem
);

export default router;
