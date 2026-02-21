// apps/backend/src/routes/inventoryVerification.routes.ts

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  getNudge,
  getNextDashboardNudge,
  verifyItem,
  getStats,
} from '../controllers/inventoryVerification.controller';
import { getProtectionGap } from '../controllers/insuranceAuditor.controller';
import { getHomeEquity } from '../controllers/valueIntelligence.controller';
import {
  extractInsuranceOcr,
  confirmInsuranceOcr,
} from '../controllers/insuranceOcr.controller';

const router = Router();
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image uploads are allowed'));
  },
});

router.use(apiRateLimiter);
router.use(authenticate);

// GET /api/properties/:propertyId/nudges/next
router.get(
  '/properties/:propertyId/nudges/next',
  propertyAuthMiddleware,
  getNextDashboardNudge
);

router.get(
  '/properties/:propertyId/insurance/protection-gap',
  propertyAuthMiddleware,
  getProtectionGap
);

router.get(
  '/properties/:propertyId/value/home-equity',
  propertyAuthMiddleware,
  getHomeEquity
);

router.post(
  '/properties/:propertyId/insurance/:policyId/ocr/extract',
  propertyAuthMiddleware,
  uploadImage.single('file'),
  extractInsuranceOcr
);

router.post(
  '/properties/:propertyId/insurance/:policyId/ocr/confirm',
  propertyAuthMiddleware,
  confirmInsuranceOcr
);

// GET /api/properties/:propertyId/inventory/verification/nudge
router.get(
  '/properties/:propertyId/inventory/verification/nudge',
  propertyAuthMiddleware,
  getNudge
);

// POST /api/properties/:propertyId/inventory/:itemId/verify
router.post(
  '/properties/:propertyId/inventory/:itemId/verify',
  propertyAuthMiddleware,
  verifyItem
);

// GET /api/properties/:propertyId/inventory/verification/stats
router.get(
  '/properties/:propertyId/inventory/verification/stats',
  propertyAuthMiddleware,
  getStats
);

export default router;
