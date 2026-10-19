// apps/backend/src/routes/financing.routes.ts
import { Router } from 'express';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { UserRole } from '../types/auth.types';

import {
  getFinancingProfile,
  upsertFinancingProfile,
  getFinancingProfileHistory,
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

// Reads stay at VIEWER. Every route that writes (and the ones that fetch or generate on the household's behalf) requires at least CONTRIBUTOR:
// propertyAuthMiddleware only proves membership, so without the floor a VIEWER could change shared records over HTTP.
// POST /financing/calculate is a stateless calculator (it persists nothing), so it stays open to a viewer.
const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ─── Financing Profile ────────────────────────────────────────────────────────
// The persisted financing profile is owner-only as a whole (owner ruling 2026-10-13): reading the current profile needs OWNER, as writing it
// and reading its history do. The equity position and its history persist the mortgage balance, so they are owner-only too.
router.get('/properties/:propertyId/financing/profile', propertyAuthMiddleware, requireHouseholdRole('OWNER'), getFinancingProfile);
router.put(
  '/properties/:propertyId/financing/profile',
  propertyAuthMiddleware,
  // The persisted financing profile is owner-only as a whole (owner ruling 2026-10-13); the canonical writer enforces it too.
  requireHouseholdRole('OWNER'),
  validateBody(UpsertFinancingProfileSchema),
  upsertFinancingProfile,
);
router.get(
  '/properties/:propertyId/financing/profile/history',
  propertyAuthMiddleware,
  requireHouseholdRole('OWNER'),
  getFinancingProfileHistory,
);

// ─── Equity Position ──────────────────────────────────────────────────────────
router.get('/properties/:propertyId/financing/equity', propertyAuthMiddleware, requireHouseholdRole('OWNER'), getEquityPosition);
router.post(
  '/properties/:propertyId/financing/equity/refresh',
  propertyAuthMiddleware,
  // The refresh returns the persisted equity position, which carries the mortgage balance.
  requireHouseholdRole('OWNER'),
  refreshEquityPosition,
);
router.get(
  '/properties/:propertyId/financing/equity/history',
  propertyAuthMiddleware,
  requireHouseholdRole('OWNER'),
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
  requireHouseholdRole('CONTRIBUTOR'),
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
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(UpdateScenarioSchema),
  updateFinancingScenario,
);
router.delete(
  '/properties/:propertyId/financing/scenarios/:scenarioId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
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
