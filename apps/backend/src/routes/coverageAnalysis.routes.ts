import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  getCoverageAnalysis,
  runCoverageAnalysis,
  simulateCoverageAnalysis,
} from '../controllers/coverageAnalysis.controller';

const router = Router();

const overrideSchema = z.object({
  annualPremiumUsd: z.number().nonnegative().optional(),
  deductibleUsd: z.number().nonnegative().optional(),
  warrantyAnnualCostUsd: z.number().nonnegative().optional(),
  warrantyServiceFeeUsd: z.number().nonnegative().optional(),
  cashBufferUsd: z.number().nonnegative().optional(),
  riskTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

const runBodySchema = z.object({
  overrides: overrideSchema.optional(),
});

const simulateBodySchema = z.object({
  overrides: overrideSchema.optional(),
  saveScenario: z.boolean().optional(),
  name: z.string().trim().max(120).optional(),
});

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/coverage-analysis',
  propertyAuthMiddleware,
  getCoverageAnalysis
);

router.post(
  '/properties/:propertyId/coverage-analysis/run',
  propertyAuthMiddleware,
  validateBody(runBodySchema),
  runCoverageAnalysis
);

router.post(
  '/properties/:propertyId/coverage-analysis/simulate',
  propertyAuthMiddleware,
  validateBody(simulateBodySchema),
  simulateCoverageAnalysis
);

export default router;
