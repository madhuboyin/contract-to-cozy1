import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody, validate } from '../middleware/validate.middleware';
import { apiRateLimiter, expensiveAiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateImageArrayUpload } from '../utils/documentValidator.util';
import { requireCapability } from '../middleware/adminCapability.middleware';
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
  runInspectionReadinessCheck,
  listInspectionReadinessChecks,
  getInspectionReadinessCheck,
} from '../controllers/inspectionReadiness.controller';

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

// Configure multer for readiness-check photo uploads
const readinessUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 12, // one inspection stage, not a whole property
  },
  fileFilter: (_req, file, cb) => {
    // Explicit allowlist — SVG excluded (it executes JS when rendered as <img>)
    const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
    if (allowed.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WEBP image files are allowed'));
    }
  },
});

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

// ── Inspection Readiness Checks ─────────────────────────────────────────────────
router.post(
  '/properties/:propertyId/permits/:permitId/inspections/:milestoneId/readiness-checks',
  propertyAuthMiddleware,
  expensiveAiRateLimiter,
  readinessUpload.array('photos', 12),
  validateImageArrayUpload,
  runInspectionReadinessCheck,
);
router.get(
  '/properties/:propertyId/permits/:permitId/inspections/:milestoneId/readiness-checks',
  propertyAuthMiddleware,
  listInspectionReadinessChecks,
);
router.get(
  '/properties/:propertyId/permits/:permitId/inspections/:milestoneId/readiness-checks/:checkId',
  propertyAuthMiddleware,
  getInspectionReadinessCheck,
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
const requirePermitAdmin = [requireRole(UserRole.ADMIN), requireMfa, requireCapability('INTEGRATION_MANAGE' as const)];
router.get('/admin/permits/data-sources', ...requirePermitAdmin, adminListDataSources);
router.post(
  '/admin/permits/data-sources',
  ...requirePermitAdmin,
  validateBody(AdminCreateDataSourceSchema),
  adminCreateDataSource,
);
router.put(
  '/admin/permits/data-sources/:id',
  ...requirePermitAdmin,
  validateBody(AdminUpdateDataSourceSchema),
  adminUpdateDataSource,
);
router.patch(
  '/admin/permits/data-sources/:id/status',
  ...requirePermitAdmin,
  validateBody(AdminPatchDataSourceStatusSchema),
  adminPatchDataSourceStatus,
);
router.post(
  '/admin/permits/data-sources/:id/test',
  ...requirePermitAdmin,
  adminTestDataSource,
);

export default router;
