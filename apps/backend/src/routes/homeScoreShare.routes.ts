import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  createBuyerShareToken,
  revokeBuyerShareToken,
  getBuyerReport,
  getBuyerReportPreview,
} from '../controllers/homeScoreShare.controller';

const router = Router();

/**
 * Create a buyer-facing share token for a property's HomeScore report.
 * POST /api/properties/:propertyId/home-score/share
 */
router.post(
  '/properties/:propertyId/home-score/share',
  apiRateLimiter,
  authenticate,
  propertyAuthMiddleware,
  createBuyerShareToken
);

/**
 * Revoke the active buyer share token for a property.
 * POST /api/properties/:propertyId/home-score/share/revoke
 */
router.post(
  '/properties/:propertyId/home-score/share/revoke',
  apiRateLimiter,
  authenticate,
  propertyAuthMiddleware,
  revokeBuyerShareToken
);

/**
 * Authenticated preview — owner sees exactly what buyers will see, no token required.
 * GET /api/properties/:propertyId/home-score/buyer-preview
 */
router.get(
  '/properties/:propertyId/home-score/buyer-preview',
  apiRateLimiter,
  authenticate,
  propertyAuthMiddleware,
  getBuyerReportPreview
);

/**
 * Public endpoint — fetch buyer report by share token (no auth required).
 * GET /api/home-score/share/:token
 */
router.get('/home-score/share/:token', apiRateLimiter, getBuyerReport);

export default router;
