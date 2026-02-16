// apps/backend/src/routes/homeCapitalTimeline.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody, validate } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

import {
  getLatestTimeline,
  runTimeline,
  listOverrides,
  createOverride,
  updateOverride,
  deleteOverride,
} from '../controllers/homeCapitalTimeline.controller';

import {
  runTimelineBodySchema,
  createOverrideBodySchema,
  updateOverrideBodySchema,
  listOverridesQuerySchema,
} from '../validators/homeCapitalTimeline.validators';

const router = Router();

// common middleware
router.use(apiRateLimiter);
router.use(authenticate);

// Timeline endpoints
router.get(
  '/properties/:propertyId/capital-timeline',
  propertyAuthMiddleware,
  getLatestTimeline,
);

router.post(
  '/properties/:propertyId/capital-timeline/run',
  propertyAuthMiddleware,
  validateBody(runTimelineBodySchema),
  runTimeline,
);

// Override endpoints
router.get(
  '/properties/:propertyId/capital-timeline/overrides',
  propertyAuthMiddleware,
  validate(listOverridesQuerySchema.transform((query) => ({ query }))),
  listOverrides,
);

router.post(
  '/properties/:propertyId/capital-timeline/overrides',
  propertyAuthMiddleware,
  validateBody(createOverrideBodySchema),
  createOverride,
);

router.patch(
  '/properties/:propertyId/capital-timeline/overrides/:overrideId',
  propertyAuthMiddleware,
  validateBody(updateOverrideBodySchema),
  updateOverride,
);

router.delete(
  '/properties/:propertyId/capital-timeline/overrides/:overrideId',
  propertyAuthMiddleware,
  deleteOverride,
);

export default router;
