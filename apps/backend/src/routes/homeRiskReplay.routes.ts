import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { requireReviewedIntelligenceCoverage } from '../middleware/intelligenceCoverage.middleware';
import {
  getHomeRiskReplayDetail,
  listHomeRiskReplayRuns,
  trackHomeRiskReplayEvent,
} from '../controllers/homeRiskReplay.controller';
import {
  homeRiskReplayPropertyParamsSchema,
  homeRiskReplayRunParamsSchema,
  listHomeRiskReplayRunsQuerySchema,
  trackHomeRiskReplayEventBodySchema,
} from '../validators/homeRiskReplay.validators';
import {
  getPastHazardExposureView,
  linkPastHazardEvidence,
  recordPastHazardOutcome,
} from '../propertyIntelligence/pastHazardExposure.controller';
import {
  linkPropertyHazardEvidenceBodySchema,
  pastHazardExposureParamsSchema,
  propertyHazardEvidenceParamsSchema,
  propertyHazardOutcomeParamsSchema,
  recordPropertyHazardOutcomeBodySchema,
} from '../propertyIntelligence/pastHazardExposure.validators';

const router = Router();
const requireReviewedCoverage = requireReviewedIntelligenceCoverage('HOME_RISK_REPLAY');

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/past-hazard-exposure',
  validate(pastHazardExposureParamsSchema),
  propertyAuthMiddleware,
  requireReviewedCoverage,
  getPastHazardExposureView,
);

router.post(
  '/properties/:propertyId/past-hazard-exposure/:propertyMatchId/outcome',
  validate(propertyHazardOutcomeParamsSchema),
  propertyAuthMiddleware,
  requireReviewedCoverage,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(recordPropertyHazardOutcomeBodySchema),
  recordPastHazardOutcome,
);

router.post(
  '/properties/:propertyId/past-hazard-exposure/outcomes/:outcomeId/evidence',
  validate(propertyHazardEvidenceParamsSchema),
  propertyAuthMiddleware,
  requireReviewedCoverage,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(linkPropertyHazardEvidenceBodySchema),
  linkPastHazardEvidence,
);

router.post(
  '/properties/:propertyId/risk-replay/runs',
  validate(homeRiskReplayPropertyParamsSchema),
  propertyAuthMiddleware,
  requireReviewedCoverage,
  (_req, res) => {
    res.status(410).json({
      success: false,
      code: 'LEGACY_RISK_REPLAY_GENERATION_RETIRED',
      message:
        'Manual replay generation has been retired. Use the reviewed Past Hazard Exposure source view.',
    });
  },
);

router.get(
  '/properties/:propertyId/risk-replay/runs',
  validate(homeRiskReplayPropertyParamsSchema.extend({
    query: listHomeRiskReplayRunsQuerySchema,
  })),
  propertyAuthMiddleware,
  requireReviewedCoverage,
  listHomeRiskReplayRuns,
);

router.get(
  '/properties/:propertyId/risk-replay/runs/:replayRunId',
  validate(homeRiskReplayRunParamsSchema),
  propertyAuthMiddleware,
  requireReviewedCoverage,
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
