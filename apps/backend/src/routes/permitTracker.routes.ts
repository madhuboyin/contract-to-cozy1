import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
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
  recordOfficialPermitStatus,
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
  createFlagRemediationCase,
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
  RecordOfficialPermitStatusSchema,
  AddInspectionMilestoneSchema,
  UpdateInspectionMilestoneSchema,
  UpdateFlagSchema,
  CreateManualFlagSchema,
  CreateRemediationCaseSchema,
  ListPermitsSchema,
  ListFlagsSchema,
  AdminCreateDataSourceSchema,
  AdminUpdateDataSourceSchema,
  AdminPatchDataSourceStatusSchema,
} from '../validators/permitTracker.validators';

// Reads stay at VIEWER. Every route that writes (and the ones that fetch or generate on the household's behalf) requires at least CONTRIBUTOR:
// propertyAuthMiddleware only proves membership, so without the floor a VIEWER could change shared records over HTTP.
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
router.post('/properties/:propertyId/permits/fetch', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), triggerPermitFetch);
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
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(CreateManualPermitSchema),
  createManualPermit,
);
router.get('/properties/:propertyId/permits/:permitId', propertyAuthMiddleware, getPermitDetail);
router.patch(
  '/properties/:propertyId/permits/:permitId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(UpdatePermitSchema),
  updatePermit,
);
router.post(
  '/properties/:propertyId/permits/:permitId/official-status',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(RecordOfficialPermitStatusSchema),
  recordOfficialPermitStatus,
);
router.delete('/properties/:propertyId/permits/:permitId', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), deletePermit);

// ── Inspection Milestones ──────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/permits/:permitId/inspections',
  propertyAuthMiddleware,
  listInspectionMilestones,
);
router.post(
  '/properties/:propertyId/permits/:permitId/inspections',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(AddInspectionMilestoneSchema),
  addInspectionMilestone,
);
router.patch(
  '/properties/:propertyId/permits/:permitId/inspections/:milestoneId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(UpdateInspectionMilestoneSchema),
  updateInspectionMilestone,
);
router.delete(
  '/properties/:propertyId/permits/:permitId/inspections/:milestoneId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  deleteInspectionMilestone,
);

// ── Inspection Readiness Checks ─────────────────────────────────────────────────
router.post(
  '/properties/:propertyId/permits/:permitId/inspections/:milestoneId/readiness-checks',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
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
  requireHouseholdRole('CONTRIBUTOR'),
  runDetectionScan,
);
router.post(
  '/properties/:propertyId/permits/flags',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(CreateManualFlagSchema),
  createManualFlag,
);
router.get('/properties/:propertyId/permits/flags/:flagId', propertyAuthMiddleware, getPermitFlag);
router.patch(
  '/properties/:propertyId/permits/flags/:flagId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(UpdateFlagSchema),
  updatePermitFlag,
);
router.post(
  '/properties/:propertyId/permits/flags/:flagId/remediation-case',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(CreateRemediationCaseSchema),
  createFlagRemediationCase,
);

// ── Disclosure Export ──────────────────────────────────────────────────────────
router.get('/properties/:propertyId/permits/disclosure', propertyAuthMiddleware, listDisclosureExports);
router.post('/properties/:propertyId/permits/disclosure', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), requestDisclosureExport);
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
