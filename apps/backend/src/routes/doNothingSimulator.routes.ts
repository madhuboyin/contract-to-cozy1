import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  createDoNothingScenario,
  deleteDoNothingScenario,
  getLatestDoNothingRun,
  listDoNothingScenarios,
  runDoNothingSimulation,
  updateDoNothingScenario,
} from '../controllers/doNothingSimulator.controller';

const router = Router();

const horizonSchema = z.union([z.literal(6), z.literal(12), z.literal(24), z.literal(36)]);

const inputOverridesSchema = z.object({
  skipMaintenance: z.boolean().optional(),
  skipWarranty: z.boolean().optional(),
  deductibleStrategy: z.enum(['KEEP_HIGH', 'RAISE', 'LOWER', 'UNCHANGED']).optional(),
  cashBufferCents: z.number().int().nonnegative().optional(),
  ignoreTopRisks: z.array(z.string().min(1)).optional(),
  riskTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

const createScenarioBodySchema = z.object({
  name: z.string().min(1),
  horizonMonths: horizonSchema,
  inputOverrides: inputOverridesSchema.optional(),
});

const updateScenarioBodySchema = z.object({
  name: z.string().min(1).optional(),
  horizonMonths: horizonSchema.optional(),
  inputOverrides: inputOverridesSchema.optional(),
});

const runSimulationBodySchema = z.object({
  scenarioId: z.string().uuid().optional(),
  horizonMonths: horizonSchema,
  inputOverrides: inputOverridesSchema.optional(),
});

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/do-nothing/scenarios',
  propertyAuthMiddleware,
  listDoNothingScenarios
);

router.post(
  '/properties/:propertyId/do-nothing/scenarios',
  propertyAuthMiddleware,
  validateBody(createScenarioBodySchema),
  createDoNothingScenario
);

router.patch(
  '/properties/:propertyId/do-nothing/scenarios/:scenarioId',
  propertyAuthMiddleware,
  validateBody(updateScenarioBodySchema),
  updateDoNothingScenario
);

router.delete(
  '/properties/:propertyId/do-nothing/scenarios/:scenarioId',
  propertyAuthMiddleware,
  deleteDoNothingScenario
);

router.get(
  '/properties/:propertyId/do-nothing/runs/latest',
  propertyAuthMiddleware,
  getLatestDoNothingRun
);

router.post(
  '/properties/:propertyId/do-nothing/run',
  propertyAuthMiddleware,
  validateBody(runSimulationBodySchema),
  runDoNothingSimulation
);

export default router;
