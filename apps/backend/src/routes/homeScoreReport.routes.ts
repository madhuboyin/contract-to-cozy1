import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  getHomeScoreCorrections,
  getHomeScoreFactors,
  getHomeScoreHistory,
  getHomeScoreReport,
  refreshHomeScoreReport,
  submitHomeScoreCorrection,
} from '../controllers/homeScoreReport.controller';

const router = Router();

const weeksQuerySchema = z.object({
  query: z.object({
    weeks: z.coerce.number().int().min(8).max(104).optional(),
  }),
});

const correctionsQuerySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

const correctionBodySchema = z.object({
  fieldKey: z.string().min(1).max(80),
  title: z.string().min(1).max(180).optional(),
  detail: z.string().min(6).max(2000),
  proposedValue: z.string().max(500).optional(),
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

router.get(
  '/properties/:propertyId/home-score/corrections',
  propertyAuthMiddleware,
  validate(correctionsQuerySchema),
  getHomeScoreCorrections
);

router.post(
  '/properties/:propertyId/home-score/corrections',
  propertyAuthMiddleware,
  validateBody(correctionBodySchema),
  submitHomeScoreCorrection
);

export default router;
