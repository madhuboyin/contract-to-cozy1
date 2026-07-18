// apps/backend/src/routes/adminCase.routes.ts
//
// Admin case management API (ADMIN_MODULE_FRD.md §10.5 safety/abuse case
// types + Phase 1 cross-domain case foundation). Entirely under
// SUPPORT_CASE_MANAGE; the richer SAFETY-specific workflow (containment,
// evidence, notification decisions) remains PLANNED and will layer
// SAFETY_INCIDENT_MANAGE on top.

import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  AddCaseNoteBodySchema,
  AssignCaseBodySchema,
  ChangeCaseStatusBodySchema,
  CreateCaseBodySchema,
  ListCasesQuerySchema,
} from '../validators/adminCase.validators';
import {
  addCaseNoteHandler,
  assignCaseHandler,
  changeCaseStatusHandler,
  createCaseHandler,
  getCaseDetailHandler,
  listCasesHandler,
} from '../controllers/adminCase.controller';

const router = Router();

router.use(
  '/admin/cases',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('SUPPORT_CASE_MANAGE')
);

/**
 * @swagger
 * /api/admin/cases:
 *   get:
 *     summary: Case list — defaults to the open working set, filter by type/status/severity/entity
 *     tags: [Admin Cases]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/cases', validate(ListCasesQuerySchema), listCasesHandler);

/**
 * @swagger
 * /api/admin/cases:
 *   post:
 *     summary: Open a case (SAFETY/ABUSE/REVIEW_INVESTIGATION/SUPPORT) with severity and optional linked entity
 *     tags: [Admin Cases]
 *     security:
 *       - bearerAuth: []
 */
router.post('/admin/cases', validateBody(CreateCaseBodySchema), createCaseHandler);

/**
 * @swagger
 * /api/admin/cases/{caseId}:
 *   get:
 *     summary: Case detail with note trail
 *     tags: [Admin Cases]
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/cases/:caseId', getCaseDetailHandler);

/**
 * @swagger
 * /api/admin/cases/{caseId}/status:
 *   post:
 *     summary: Governed case lifecycle transition (resolution required to resolve)
 *     tags: [Admin Cases]
 *     security:
 *       - bearerAuth: []
 */
router.post('/admin/cases/:caseId/status', validateBody(ChangeCaseStatusBodySchema), changeCaseStatusHandler);

/**
 * @swagger
 * /api/admin/cases/{caseId}/assign:
 *   post:
 *     summary: Assign or unassign a case to an ADMIN user
 *     tags: [Admin Cases]
 *     security:
 *       - bearerAuth: []
 */
router.post('/admin/cases/:caseId/assign', validateBody(AssignCaseBodySchema), assignCaseHandler);

/**
 * @swagger
 * /api/admin/cases/{caseId}/notes:
 *   post:
 *     summary: Add a note to the case trail
 *     tags: [Admin Cases]
 *     security:
 *       - bearerAuth: []
 */
router.post('/admin/cases/:caseId/notes', validateBody(AddCaseNoteBodySchema), addCaseNoteHandler);

export default router;
