import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody, validate } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { UserRole } from '../types/auth.types';

import {
  triggerPermitFetch,
  getPermitFetchStatus,
  listPermits,
  createManualPermit,
  getPermitDetail,
  updatePermit,
  deletePermit,
  getPermitSummary,
  listInspectionMilestones,
  addInspectionMilestone,
  updateInspectionMilestone,
  deleteInspectionMilestone,
  listPermitFlags,
  getPermitFlag,
  updatePermitFlag,
  createManualFlag,
  runDetectionScan,
  requestDisclosureExport,
  getDisclosureExport,
  listDisclosureExports,
  adminListDataSources,
  adminCreateDataSource,
  adminUpdateDataSource,
  adminPatchDataSourceStatus,
  adminTestDataSource,
} from '../controllers/permitTracker.controller';

import {
  CreateManualPermitSchema,
  UpdatePermitSchema,
  AddInspectionMilestoneSchema,
  UpdateInspectionMilestoneSchema,
  UpdateFlagSchema,
  CreateManualFlagSchema,
  ListPermitsSchema,
  ListFlagsSchema,
  AdminCreateDataSourceSchema,
  AdminUpdateDataSourceSchema,
  AdminPatchDataSourceStatusSchema,
} from '../validators/permitTracker.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ── Open Data Fetch ────────────────────────────────────────────────────────────
router.post('/properties/:propertyId/permits/fetch', propertyAuthMiddleware, triggerPermitFetch);
router.get('/properties/:propertyId/permits/fetch/status', propertyAuthMiddleware, getPermitFetchStatus);

// ── Permit Records ─────────────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/permits/summary',
  propertyAuthMiddleware,
  getPermitSummary,
);
router.get(
  '/properties/:propertyId/permits',
  propertyAuthMiddleware,
  validate(ListPermitsSchema.transform((q) => ({ query: q }))),
  listPermits,
);
router.post(
  '/properties/:propertyId/permits',
  propertyAuthMiddleware,
  validateBody(CreateManualPermitSchema),
  createManualPermit,
);
router.get('/properties/:propertyId/permits/:permitId', propertyAuthMiddleware, getPermitDetail);
router.patch(
  '/properties/:propertyId/permits/:permitId',
  propertyAuthMiddleware,
  validateBody(UpdatePermitSchema),
  updatePermit,
);
router.delete('/properties/:propertyId/permits/:permitId', propertyAuthMiddleware, deletePermit);

// ── Inspection Milestones ──────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/permits/:permitId/inspections',
  propertyAuthMiddleware,
  listInspectionMilestones,
);
router.post(
  '/properties/:propertyId/permits/:permitId/inspections',
  propertyAuthMiddleware,
  validateBody(AddInspectionMilestoneSchema),
  addInspectionMilestone,
);
router.patch(
  '/properties/:propertyId/permits/:permitId/inspections/:milestoneId',
  propertyAuthMiddleware,
  validateBody(UpdateInspectionMilestoneSchema),
  updateInspectionMilestone,
);
router.delete(
  '/properties/:propertyId/permits/:permitId/inspections/:milestoneId',
  propertyAuthMiddleware,
  deleteInspectionMilestone,
);

// ── Unpermitted Flags ──────────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/permits/flags',
  propertyAuthMiddleware,
  validate(ListFlagsSchema.transform((q) => ({ query: q }))),
  listPermitFlags,
);
router.post(
  '/properties/:propertyId/permits/flags/scan',
  propertyAuthMiddleware,
  runDetectionScan,
);
router.post(
  '/properties/:propertyId/permits/flags',
  propertyAuthMiddleware,
  validateBody(CreateManualFlagSchema),
  createManualFlag,
);
router.get('/properties/:propertyId/permits/flags/:flagId', propertyAuthMiddleware, getPermitFlag);
router.patch(
  '/properties/:propertyId/permits/flags/:flagId',
  propertyAuthMiddleware,
  validateBody(UpdateFlagSchema),
  updatePermitFlag,
);

// ── Disclosure Export ──────────────────────────────────────────────────────────
router.get('/properties/:propertyId/permits/disclosure', propertyAuthMiddleware, listDisclosureExports);
router.post('/properties/:propertyId/permits/disclosure', propertyAuthMiddleware, requestDisclosureExport);
router.get(
  '/properties/:propertyId/permits/disclosure/:exportId',
  propertyAuthMiddleware,
  getDisclosureExport,
);

// ── Admin — Data Sources ───────────────────────────────────────────────────────
router.get('/admin/permits/data-sources', requireRole(UserRole.ADMIN), adminListDataSources);
router.post(
  '/admin/permits/data-sources',
  requireRole(UserRole.ADMIN),
  validateBody(AdminCreateDataSourceSchema),
  adminCreateDataSource,
);
router.put(
  '/admin/permits/data-sources/:id',
  requireRole(UserRole.ADMIN),
  validateBody(AdminUpdateDataSourceSchema),
  adminUpdateDataSource,
);
router.patch(
  '/admin/permits/data-sources/:id/status',
  requireRole(UserRole.ADMIN),
  validateBody(AdminPatchDataSourceStatusSchema),
  adminPatchDataSourceStatus,
);
router.post(
  '/admin/permits/data-sources/:id/test',
  requireRole(UserRole.ADMIN),
  adminTestDataSource,
);

export default router;
