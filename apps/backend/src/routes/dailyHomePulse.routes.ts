import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
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
  checkinDailySnapshot
);
router.post(
  '/properties/:propertyId/micro-actions/:actionId/complete',
  propertyAuthMiddleware,
  completeDailyMicroAction
);
router.post(
  '/properties/:propertyId/micro-actions/:actionId/dismiss',
  propertyAuthMiddleware,
  dismissDailyMicroAction
);

export default router;

