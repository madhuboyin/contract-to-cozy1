import { Request, Response, Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { requireReviewedIntelligenceCoverage } from '../middleware/intelligenceCoverage.middleware';
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
const legacyRiskReplayRetired = (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    code: 'LEGACY_RISK_REPLAY_RETIRED',
    message:
      'Home Risk Replay has been retired. Use the reviewed Past Hazard Exposure source view.',
    replacement: '/api/properties/:propertyId/past-hazard-exposure',
  });
};

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
  validate(pastHazardExposureParamsSchema),
  propertyAuthMiddleware,
  legacyRiskReplayRetired,
);

router.get(
  '/properties/:propertyId/risk-replay/runs',
  validate(pastHazardExposureParamsSchema),
  propertyAuthMiddleware,
  legacyRiskReplayRetired,
);

router.get(
  '/properties/:propertyId/risk-replay/runs/:replayRunId',
  validate(pastHazardExposureParamsSchema),
  propertyAuthMiddleware,
  legacyRiskReplayRetired,
);

router.post(
  '/properties/:propertyId/risk-replay/events',
  validate(pastHazardExposureParamsSchema),
  propertyAuthMiddleware,
  legacyRiskReplayRetired,
);

export default router;
