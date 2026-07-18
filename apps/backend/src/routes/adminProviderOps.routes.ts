// apps/backend/src/routes/adminProviderOps.routes.ts
//
// Provider Operations directory API (ADMIN_MODULE_FRD.md §10.2, Phase 2
// slice). Provider-centric expansion of the credential-centric admin queue
// in providerCredential.routes.ts — reads under PROVIDER_VIEW, the governed
// marketplace-status transition under PROVIDER_SUSPEND.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  ChangeProviderStatusBodySchema,
  ListProvidersQuerySchema,
} from '../validators/adminProviderOps.validators';
import {
  changeProviderStatusHandler,
  getProviderDetailHandler,
  listProvidersHandler,
} from '../controllers/adminProviderOps.controller';

const router = Router();

router.use('/admin/providers', authenticate, requireMfa, requireRole(UserRole.ADMIN));

/**
 * @swagger
 * /api/admin/providers:
 *   get:
 *     summary: Provider directory — search by business/user name/email, filter by status
 *     tags: [Admin Provider Operations]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/providers', requireCapability('PROVIDER_VIEW'), validate(ListProvidersQuerySchema), listProvidersHandler);

/**
 * @swagger
 * /api/admin/providers/{providerProfileId}:
 *   get:
 *     summary: Provider operational detail — credentials, compliance alerts, booking/review context
 *     tags: [Admin Provider Operations]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/providers/:providerProfileId', requireCapability('PROVIDER_VIEW'), getProviderDetailHandler);

/**
 * @swagger
 * /api/admin/providers/{providerProfileId}/status:
 *   post:
 *     summary: Governed provider marketplace-status transition (ACTIVE/SUSPENDED/INACTIVE)
 *     tags: [Admin Provider Operations]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/providers/:providerProfileId/status',
  requireCapability('PROVIDER_SUSPEND'),
  validateBody(ChangeProviderStatusBodySchema),
  changeProviderStatusHandler
);

export default router;
