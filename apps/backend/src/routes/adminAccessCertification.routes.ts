// apps/backend/src/routes/adminAccessCertification.routes.ts
//
// Periodic access certification API (ADMIN_MODULE_FRD.md §17 Phase 6).
// Entirely under ADMIN_ROLE_MANAGE (CRITICAL) — certification decides
// capability grants, so it carries the same gate as grant/revoke.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  AttestDecisionBodySchema,
  CampaignActionBodySchema,
  OpenCampaignBodySchema,
} from '../validators/adminAccessCertification.validators';
import {
  attestDecisionHandler,
  cancelCampaignHandler,
  completeCampaignHandler,
  getCampaignDetailHandler,
  listCampaignsHandler,
  openCampaignHandler,
} from '../controllers/adminAccessCertification.controller';

const router = Router();

router.use(
  '/admin/access-certification',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('ADMIN_ROLE_MANAGE')
);

/**
 * @swagger
 * /api/admin/access-certification/campaigns:
 *   get:
 *     summary: Certification campaigns with attestation progress
 *     tags: [Admin Access Certification]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/access-certification/campaigns', listCampaignsHandler);

/**
 * @swagger
 * /api/admin/access-certification/campaigns:
 *   post:
 *     summary: Open a campaign — snapshots every active capability grant into pending decisions
 *     tags: [Admin Access Certification]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/access-certification/campaigns',
  validateBody(OpenCampaignBodySchema),
  openCampaignHandler
);

/**
 * @swagger
 * /api/admin/access-certification/campaigns/{campaignId}:
 *   get:
 *     summary: Campaign detail with per-grant decisions
 *     tags: [Admin Access Certification]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/access-certification/campaigns/:campaignId', getCampaignDetailHandler);

/**
 * @swagger
 * /api/admin/access-certification/decisions/{decisionId}/attest:
 *   post:
 *     summary: Attest one decision KEEP or REVOKE (holder cannot self-attest; REVOKE executes the revoke)
 *     tags: [Admin Access Certification]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/access-certification/decisions/:decisionId/attest',
  validateBody(AttestDecisionBodySchema),
  attestDecisionHandler
);

/**
 * @swagger
 * /api/admin/access-certification/campaigns/{campaignId}/complete:
 *   post:
 *     summary: Complete a campaign (all decisions must be attested)
 *     tags: [Admin Access Certification]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/access-certification/campaigns/:campaignId/complete',
  validateBody(CampaignActionBodySchema),
  completeCampaignHandler
);

/**
 * @swagger
 * /api/admin/access-certification/campaigns/{campaignId}/cancel:
 *   post:
 *     summary: Cancel an open campaign
 *     tags: [Admin Access Certification]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/admin/access-certification/campaigns/:campaignId/cancel',
  validateBody(CampaignActionBodySchema),
  cancelCampaignHandler
);

export default router;
