// apps/backend/src/routes/inventoryVerification.routes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  getNudge,
  getNextDashboardNudge,
  verifyItem,
  getStats,
} from '../controllers/inventoryVerification.controller';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// GET /api/properties/:propertyId/nudges/next
router.get(
  '/properties/:propertyId/nudges/next',
  propertyAuthMiddleware,
  getNextDashboardNudge
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
