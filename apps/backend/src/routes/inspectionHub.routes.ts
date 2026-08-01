import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  UploadReportBodySchema,
  UpdateFindingSchema,
  DismissFindingSchema,
  ResolveFindingSchema,
  NegotiationPackageSchema,
  FixDisclosureDecisionsSchema,
  InspectionFindingWorkDispositionSchema,
} from '../validators/inspectionHub.validators';
import {
  getHub,
  listReports,
  uploadReport,
  getReport,
  archiveReport,
  listFindings,
  updateFinding,
  dismissFinding,
  getWriteBackPreviewHandler,
  confirmReport,
  listOpenItems,
  resolveFinding,
  compareReports,
  generateNegotiationPackage,
  getFixDisclosureDecisions,
  saveFixDisclosureDecisions,
  acceptFindingAsWork,
  dispositionFindingAsWork,
} from '../controllers/inspectionHub.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB per spec
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ── Hub overview ──────────────────────────────────────────────────────────────
router.get('/properties/:propertyId/inspection-hub', propertyAuthMiddleware, getHub);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/properties/:propertyId/inspection-hub/reports', propertyAuthMiddleware, listReports);

router.post(
  '/properties/:propertyId/inspection-hub/reports',
  propertyAuthMiddleware,
  upload.single('file'),
  validateBody(UploadReportBodySchema),
  uploadReport,
);

router.post(
  '/properties/:propertyId/inspection-hub/reports/:reportId/findings/:findingId/work-disposition',
  propertyAuthMiddleware,
  validateBody(InspectionFindingWorkDispositionSchema),
  dispositionFindingAsWork,
);

router.get(
  '/properties/:propertyId/inspection-hub/reports/:reportId',
  propertyAuthMiddleware,
  getReport,
);

router.delete(
  '/properties/:propertyId/inspection-hub/reports/:reportId',
  propertyAuthMiddleware,
  archiveReport,
);

// ── Findings ──────────────────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/inspection-hub/reports/:reportId/findings',
  propertyAuthMiddleware,
  listFindings,
);

router.patch(
  '/properties/:propertyId/inspection-hub/reports/:reportId/findings/:findingId',
  propertyAuthMiddleware,
  validateBody(UpdateFindingSchema),
  updateFinding,
);

router.post(
  '/properties/:propertyId/inspection-hub/reports/:reportId/findings/:findingId/dismiss',
  propertyAuthMiddleware,
  validateBody(DismissFindingSchema),
  dismissFinding,
);

router.post(
  '/properties/:propertyId/inspection-hub/reports/:reportId/findings/:findingId/accept-as-work',
  propertyAuthMiddleware,
  acceptFindingAsWork,
);

// ── Write-back confirmation ───────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/inspection-hub/reports/:reportId/write-back-preview',
  propertyAuthMiddleware,
  getWriteBackPreviewHandler,
);

router.post(
  '/properties/:propertyId/inspection-hub/reports/:reportId/confirm',
  propertyAuthMiddleware,
  confirmReport,
);

// ── Open items ────────────────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/inspection-hub/open-items',
  propertyAuthMiddleware,
  listOpenItems,
);

router.post(
  '/properties/:propertyId/inspection-hub/findings/:findingId/resolve',
  propertyAuthMiddleware,
  validateBody(ResolveFindingSchema),
  resolveFinding,
);

// ── Multi-report comparison ───────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/inspection-hub/compare',
  propertyAuthMiddleware,
  compareReports,
);

// ── Negotiation package (PRE_PURCHASE only) ───────────────────────────────────
router.post(
  '/properties/:propertyId/inspection-hub/reports/:reportId/negotiation-package',
  propertyAuthMiddleware,
  validateBody(NegotiationPackageSchema),
  generateNegotiationPackage,
);

// ── Seller fix / disclose (PRE_LISTING only) ──────────────────────────────────
router.get(
  '/properties/:propertyId/inspection-hub/reports/:reportId/fix-disclose',
  propertyAuthMiddleware,
  getFixDisclosureDecisions,
);

router.patch(
  '/properties/:propertyId/inspection-hub/reports/:reportId/fix-disclose',
  propertyAuthMiddleware,
  validateBody(FixDisclosureDecisionsSchema),
  saveFixDisclosureDecisions,
);

export default router;
