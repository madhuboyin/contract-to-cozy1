import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  generateHomeRiskReplay,
  getHomeRiskReplayDetail,
  listHomeRiskReplayRuns,
  trackHomeRiskReplayEvent,
} from '../controllers/homeRiskReplay.controller';
import {
  generateHomeRiskReplayBodySchema,
  homeRiskReplayPropertyParamsSchema,
  homeRiskReplayRunParamsSchema,
  listHomeRiskReplayRunsQuerySchema,
  trackHomeRiskReplayEventBodySchema,
} from '../validators/homeRiskReplay.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.post(
  '/properties/:propertyId/risk-replay/runs',
  validate(homeRiskReplayPropertyParamsSchema),
  propertyAuthMiddleware,
  validateBody(generateHomeRiskReplayBodySchema),
  generateHomeRiskReplay,
);

router.get(
  '/properties/:propertyId/risk-replay/runs',
  validate(homeRiskReplayPropertyParamsSchema.extend({
    query: listHomeRiskReplayRunsQuerySchema,
  })),
  propertyAuthMiddleware,
  listHomeRiskReplayRuns,
);

router.get(
  '/properties/:propertyId/risk-replay/runs/:replayRunId',
  validate(homeRiskReplayRunParamsSchema),
  propertyAuthMiddleware,
  getHomeRiskReplayDetail,
);

router.post(
  '/properties/:propertyId/risk-replay/events',
  validate(homeRiskReplayPropertyParamsSchema),
  propertyAuthMiddleware,
  validateBody(trackHomeRiskReplayEventBodySchema),
  trackHomeRiskReplayEvent,
);

export default router;
