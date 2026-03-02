import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { createOrGetNarrativeRun, patchNarrativeRun } from '../controllers/narrative.controller';
import { patchNarrativeRunBodySchema } from '../validators/narrative.validators';

const router = Router();

router.post(
  '/properties/:propertyId/narrative/run',
  apiRateLimiter,
  authenticate,
  propertyAuthMiddleware,
  createOrGetNarrativeRun
);

router.patch(
  '/narrative/:runId',
  apiRateLimiter,
  authenticate,
  validateBody(patchNarrativeRunBodySchema),
  patchNarrativeRun
);

export default router;
