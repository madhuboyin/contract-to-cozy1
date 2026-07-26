// apps/backend/src/refinanceRadar/refinanceRadar.routes.ts
//
// Route definitions for the Mortgage Refinance Radar feature.
// All property-scoped routes use authenticate + propertyAuthMiddleware.
// Admin ingestion route uses authenticate + requireRole(ADMIN).

import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  apiRateLimiter,
  ocrRateLimiter,
  uploadRateLimiter,
} from '../middleware/rateLimiter.middleware';
import { validateDocumentArrayUpload } from '../utils/documentValidator.util';
import { RefinanceRadarController } from './refinanceRadar.controller';
import {
  compareLoanEstimatesSchema,
  historyQuerySchema,
  ingestRateSnapshotSchema,
  rateHistoryQuerySchema,
  refinanceAlertPreferenceSchema,
  refinanceFeedbackSchema,
  refinanceTelemetrySchema,
  runScenarioSchema,
  saveLoanEstimateComparisonSchema,
} from './validators/refinanceRadar.validators';

const router = Router();
const loanEstimateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (
      [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ].includes(file.mimetype)
    ) {
      callback(null, true);
    } else {
      callback(
        new Error('Only PDF, JPEG, PNG, or WEBP Loan Estimates are accepted.'),
      );
    }
  },
});

router.use(apiRateLimiter);

// ─── Property-Scoped: Radar Status ──────────────────────────────────────────

/**
 * @swagger
 * /api/properties/{propertyId}/refinance-radar:
 *   get:
 *     summary: Get current refinance radar status for a property
 *     tags: [Refinance Radar]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Current radar status
 *       422:
 *         description: Mortgage data not available
 */
router.get(
  '/properties/:propertyId/refinance-radar',
  authenticate,
  propertyAuthMiddleware,
  RefinanceRadarController.getStatus,
);

/**
 * @swagger
 * /api/properties/{propertyId}/refinance-radar/evaluate:
 *   post:
 *     summary: Trigger a fresh refinance radar evaluation
 *     tags: [Refinance Radar]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Fresh evaluation result
 */
router.post(
  '/properties/:propertyId/refinance-radar/evaluate',
  authenticate,
  propertyAuthMiddleware,
  RefinanceRadarController.evaluate,
);

router.get(
  '/properties/:propertyId/refinance-radar/alert-preferences',
  authenticate,
  propertyAuthMiddleware,
  RefinanceRadarController.getAlertPreference,
);

router.put(
  '/properties/:propertyId/refinance-radar/alert-preferences',
  authenticate,
  propertyAuthMiddleware,
  validateBody(refinanceAlertPreferenceSchema),
  RefinanceRadarController.updateAlertPreference,
);

// ─── Property-Scoped: History & Insights ────────────────────────────────────

/**
 * @swagger
 * /api/properties/{propertyId}/refinance-radar/history:
 *   get:
 *     summary: Get refinance opportunity history for a property
 *     tags: [Refinance Radar]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/properties/:propertyId/refinance-radar/history',
  authenticate,
  propertyAuthMiddleware,
  (req, _res, next) => {
    // Validate query params inline; 422 on failure
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return _res.status(400).json({
        success: false,
        error: { message: 'Invalid query parameters', code: 'VALIDATION_ERROR', details: parsed.error.issues },
      });
    }
    req.query = parsed.data as any;
    next();
  },
  RefinanceRadarController.getHistory,
);

/**
 * @swagger
 * /api/properties/{propertyId}/refinance-radar/missed-opportunity:
 *   get:
 *     summary: Get missed-opportunity insight for the property
 *     tags: [Refinance Radar]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/properties/:propertyId/refinance-radar/missed-opportunity',
  authenticate,
  propertyAuthMiddleware,
  RefinanceRadarController.getMissedOpportunity,
);

/**
 * @swagger
 * /api/properties/{propertyId}/refinance-radar/rates:
 *   get:
 *     summary: Get recent market rate history and trend
 *     tags: [Refinance Radar]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/properties/:propertyId/refinance-radar/rates',
  authenticate,
  propertyAuthMiddleware,
  (req, _res, next) => {
    const parsed = rateHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return _res.status(400).json({
        success: false,
        error: { message: 'Invalid query parameters', code: 'VALIDATION_ERROR', details: parsed.error.issues },
      });
    }
    req.query = parsed.data as any;
    next();
  },
  RefinanceRadarController.getRates,
);

// ─── Property-Scoped: Scenario Calculator ────────────────────────────────────

/**
 * @swagger
 * /api/properties/{propertyId}/refinance-scenario:
 *   post:
 *     summary: Run a refinance scenario calculation
 *     tags: [Refinance Radar]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/properties/:propertyId/refinance-scenario',
  authenticate,
  propertyAuthMiddleware,
  validateBody(runScenarioSchema),
  RefinanceRadarController.runScenario,
);

router.post(
  '/properties/:propertyId/refinance-scenario/export-markdown',
  authenticate,
  propertyAuthMiddleware,
  validateBody(runScenarioSchema),
  RefinanceRadarController.exportScenarioMarkdown,
);

router.post(
  '/properties/:propertyId/refinance-radar/loan-estimates/compare',
  authenticate,
  propertyAuthMiddleware,
  validateBody(compareLoanEstimatesSchema),
  RefinanceRadarController.compareLoanEstimates,
);

router.post(
  '/properties/:propertyId/refinance-radar/loan-estimates/export-markdown',
  authenticate,
  propertyAuthMiddleware,
  validateBody(compareLoanEstimatesSchema),
  RefinanceRadarController.exportLoanEstimateComparisonMarkdown,
);

router.post(
  '/properties/:propertyId/refinance-radar/loan-estimates/extract',
  authenticate,
  propertyAuthMiddleware,
  uploadRateLimiter,
  ocrRateLimiter,
  loanEstimateUpload.array('files', 3),
  validateDocumentArrayUpload,
  RefinanceRadarController.extractLoanEstimate,
);

router.post(
  '/properties/:propertyId/refinance-radar/loan-estimates/saved',
  authenticate,
  propertyAuthMiddleware,
  validateBody(saveLoanEstimateComparisonSchema),
  RefinanceRadarController.saveLoanEstimateComparison,
);

router.get(
  '/properties/:propertyId/refinance-radar/loan-estimates/saved',
  authenticate,
  propertyAuthMiddleware,
  RefinanceRadarController.getSavedLoanEstimateComparisons,
);

router.delete(
  '/properties/:propertyId/refinance-radar/loan-estimates/saved/:comparisonId',
  authenticate,
  propertyAuthMiddleware,
  RefinanceRadarController.deleteSavedLoanEstimateComparison,
);

router.post(
  '/properties/:propertyId/refinance-radar/feedback',
  authenticate,
  propertyAuthMiddleware,
  validateBody(refinanceFeedbackSchema),
  RefinanceRadarController.recordFeedback,
);

router.post(
  '/properties/:propertyId/refinance-radar/telemetry',
  authenticate,
  propertyAuthMiddleware,
  validateBody(refinanceTelemetrySchema),
  RefinanceRadarController.recordTelemetry,
);

/**
 * @swagger
 * /api/properties/{propertyId}/refinance-scenario/saved:
 *   get:
 *     summary: Get saved refinance scenario snapshots
 *     tags: [Refinance Radar]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/properties/:propertyId/refinance-scenario/saved',
  authenticate,
  propertyAuthMiddleware,
  RefinanceRadarController.getSavedScenarios,
);

// ─── Admin: Rate Ingestion ────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/refinance-radar/rate-snapshots:
 *   post:
 *     summary: Ingest a mortgage rate snapshot (admin / scheduled orchestration)
 *     tags: [Refinance Radar Admin]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/admin/refinance-radar/rate-snapshots',
  authenticate,
  requireRole('ADMIN' as any),
  validateBody(ingestRateSnapshotSchema),
  RefinanceRadarController.ingestRateSnapshot,
);

export default router;
