// apps/backend/src/routes/financing.routes.ts
import { Router } from 'express';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { UserRole } from '../types/auth.types';

import {
  getFinancingProfile,
  upsertFinancingProfile,
  getEquityPosition,
  refreshEquityPosition,
  getEquityHistory,
  calculateFinancing,
  listFinancingScenarios,
  createFinancingScenario,
  getFinancingScenario,
  updateFinancingScenario,
  archiveFinancingScenario,
  listRateConfigs,
  updateRateConfig,
} from '../controllers/financing.controller';

import {
  UpsertFinancingProfileSchema,
  CalculateSchema,
  CreateScenarioSchema,
  UpdateScenarioSchema,
  UpdateRateConfigSchema,
} from '../validators/financing.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ─── Financing Profile ────────────────────────────────────────────────────────
router.get('/properties/:propertyId/financing/profile', propertyAuthMiddleware, getFinancingProfile);
router.put(
  '/properties/:propertyId/financing/profile',
  propertyAuthMiddleware,
  validateBody(UpsertFinancingProfileSchema),
  upsertFinancingProfile,
);

// ─── Equity Position ──────────────────────────────────────────────────────────
router.get('/properties/:propertyId/financing/equity', propertyAuthMiddleware, getEquityPosition);
router.post(
  '/properties/:propertyId/financing/equity/refresh',
  propertyAuthMiddleware,
  refreshEquityPosition,
);
router.get(
  '/properties/:propertyId/financing/equity/history',
  propertyAuthMiddleware,
  getEquityHistory,
);

// ─── Calculator (stateless) ───────────────────────────────────────────────────
router.post(
  '/properties/:propertyId/financing/calculate',
  propertyAuthMiddleware,
  validateBody(CalculateSchema),
  calculateFinancing,
);

// ─── Scenarios ────────────────────────────────────────────────────────────────
router.get('/properties/:propertyId/financing/scenarios', propertyAuthMiddleware, listFinancingScenarios);
router.post(
  '/properties/:propertyId/financing/scenarios',
  propertyAuthMiddleware,
  validateBody(CreateScenarioSchema),
  createFinancingScenario,
);
router.get(
  '/properties/:propertyId/financing/scenarios/:scenarioId',
  propertyAuthMiddleware,
  getFinancingScenario,
);
router.patch(
  '/properties/:propertyId/financing/scenarios/:scenarioId',
  propertyAuthMiddleware,
  validateBody(UpdateScenarioSchema),
  updateFinancingScenario,
);
router.delete(
  '/properties/:propertyId/financing/scenarios/:scenarioId',
  propertyAuthMiddleware,
  archiveFinancingScenario,
);

// ─── Admin: Rate Config ───────────────────────────────────────────────────────
const requireFinancingAdmin = [requireRole(UserRole.ADMIN), requireMfa, requireCapability('FINANCING_CONFIG' as const)];
router.get('/admin/financing/rates', ...requireFinancingAdmin, listRateConfigs);
router.patch(
  '/admin/financing/rates/:type',
  ...requireFinancingAdmin,
  validateBody(UpdateRateConfigSchema),
  updateRateConfig,
);

export default router;
