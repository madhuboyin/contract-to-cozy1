import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  getHomeScoreFactors,
  getHomeScoreHistory,
  getHomeScoreReport,
  refreshHomeScoreReport,
} from '../controllers/homeScoreReport.controller';

const router = Router();

const weeksQuerySchema = z.object({
  query: z.object({
    weeks: z.coerce.number().int().min(8).max(104).optional(),
  }),
});

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/home-score/report',
  propertyAuthMiddleware,
  validate(weeksQuerySchema),
  getHomeScoreReport
);

router.post(
  '/properties/:propertyId/home-score/report/refresh',
  propertyAuthMiddleware,
  validate(weeksQuerySchema),
  refreshHomeScoreReport
);

router.get(
  '/properties/:propertyId/home-score/history',
  propertyAuthMiddleware,
  validate(weeksQuerySchema),
  getHomeScoreHistory
);

router.get(
  '/properties/:propertyId/home-score/factors',
  propertyAuthMiddleware,
  validate(weeksQuerySchema),
  getHomeScoreFactors
);

export default router;
