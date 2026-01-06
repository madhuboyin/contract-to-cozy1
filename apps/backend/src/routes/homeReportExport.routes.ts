import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import {
  createHomeReportExport,
  listHomeReportExportsForProperty,
  downloadHomeReportExport,
  downloadHomeReportByShareToken,
  createShareLinkForReport,
  revokeShareLinkForReport,
} from '../controllers/homeReportExport.controller';


const router = Router();

/**
 * Create an export for a property (generates PDF and stores as Document)
 * POST /api/properties/:propertyId/reports/exports
 */
router.post(
  '/properties/:propertyId/reports/exports',
  authenticate,
  propertyAuthMiddleware,
  createHomeReportExport
);

/**
 * List exports for a property
 * GET /api/properties/:propertyId/reports/exports
 */
router.get(
  '/properties/:propertyId/reports/exports',
  authenticate,
  propertyAuthMiddleware,
  listHomeReportExportsForProperty
);

/**
 * Download export by id (owner only)
 * GET /api/reports/exports/:exportId/download
 */
router.get(
  '/reports/exports/:exportId/download',
  authenticate,
  downloadHomeReportExport
);

/**
 * Create a share link for a report export
 * POST /api/reports/exports/:exportId/share
 */
router.post(
  '/reports/exports/:exportId/share',
  authenticate,
  createShareLinkForReport
);

/**
 * Revoke share link
 * POST /api/reports/exports/:exportId/share/revoke
 */
router.post(
  '/reports/exports/:exportId/share/revoke',
  authenticate,
  revokeShareLinkForReport
);

/**
 * Download via share token (read-only, no auth)
 * GET /api/reports/share/:token/download
 */
router.get(
  '/reports/share/:token/download',
  downloadHomeReportByShareToken
);

export default router;
