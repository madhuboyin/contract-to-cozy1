import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  assumptionSetIdParamsSchema,
  createAssumptionSetBodySchema,
  listAssumptionSetsQuerySchema,
  listSignalsQuerySchema,
  sharedPropertyParamsSchema,
  upsertPreferenceProfileBodySchema,
} from '../validators/sharedData.validators';
import {
  createAssumptionSet,
  getAssumptionSet,
  getPreferenceProfile,
  listAssumptionSets,
  listPropertySignals,
  upsertPreferenceProfile,
} from '../controllers/sharedData.controller';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/preference-profile',
  validate(sharedPropertyParamsSchema),
  propertyAuthMiddleware,
  getPreferenceProfile
);

router.put(
  '/properties/:propertyId/preference-profile',
  validate(sharedPropertyParamsSchema),
  propertyAuthMiddleware,
  validateBody(upsertPreferenceProfileBodySchema),
  upsertPreferenceProfile
);

router.post(
  '/properties/:propertyId/assumption-sets',
  validate(sharedPropertyParamsSchema),
  propertyAuthMiddleware,
  validateBody(createAssumptionSetBodySchema),
  createAssumptionSet
);

router.get(
  '/properties/:propertyId/assumption-sets',
  validate(sharedPropertyParamsSchema),
  propertyAuthMiddleware,
  validate(listAssumptionSetsQuerySchema),
  listAssumptionSets
);

router.get(
  '/properties/:propertyId/assumption-sets/:assumptionSetId',
  validate(assumptionSetIdParamsSchema),
  propertyAuthMiddleware,
  getAssumptionSet
);

router.get(
  '/properties/:propertyId/signals',
  validate(sharedPropertyParamsSchema),
  propertyAuthMiddleware,
  validate(listSignalsQuerySchema),
  listPropertySignals
);

export default router;
