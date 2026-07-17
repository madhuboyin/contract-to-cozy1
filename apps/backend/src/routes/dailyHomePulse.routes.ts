import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  checkinDailySnapshot,
  completeDailyMicroAction,
  dismissDailyMicroAction,
  getDailySnapshot,
} from '../controllers/dailyHomePulse.controller';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get('/properties/:propertyId/daily-snapshot', propertyAuthMiddleware, getDailySnapshot);
router.post(
  '/properties/:propertyId/daily-snapshot/checkin',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  checkinDailySnapshot
);
router.post(
  '/properties/:propertyId/micro-actions/:actionId/complete',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  completeDailyMicroAction
);
router.post(
  '/properties/:propertyId/micro-actions/:actionId/dismiss',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  dismissDailyMicroAction
);

export default router;
