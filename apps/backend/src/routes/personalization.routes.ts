import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  getPersonalization,
  enableOptionalHouseholdProfile,
  resetOptionalHouseholdProfile,
  refreshPersonalization,
  submitRecommendationFeedback,
  submitProfileAnswer,
  getPersonalizationModuleRecommendations,
  convertPersonalizationRecommendationToTask,
  getPersonalizationContextMap,
} from '../modules/personalization/api/personalization.controller';
import {
  RecommendationFeedbackSchema,
  OptionalProfileEnableSchema,
  ProfileAnswerSchema,
  ConvertRecommendationToTaskSchema,
} from '../modules/personalization/api/personalization.validators';
import { requirePersonalizationCapability } from '../modules/personalization/api/personalizationCapability.middleware';

const router = Router();
router.use(apiRateLimiter);
router.use(authenticate);
router.use('/properties/:propertyId/personalization', propertyAuthMiddleware);

router.get('/properties/:propertyId/personalization', requirePersonalizationCapability('canViewOrdinaryRecommendations'), getPersonalization);
router.get(
  '/properties/:propertyId/personalization/context-map',
  requirePersonalizationCapability('canViewSensitiveEvidence'),
  getPersonalizationContextMap,
);
router.post('/properties/:propertyId/personalization/profile/enable', requirePersonalizationCapability('canManageSensitiveProfile'), validateBody(OptionalProfileEnableSchema), enableOptionalHouseholdProfile);
router.post('/properties/:propertyId/personalization/refresh', requirePersonalizationCapability('canAct'), refreshPersonalization);
router.get(
  '/properties/:propertyId/personalization/modules/:module/recommendations',
  requirePersonalizationCapability('canViewOrdinaryRecommendations'),
  getPersonalizationModuleRecommendations,
);
router.post(
  '/properties/:propertyId/personalization/questions/:questionId/answers',
  requirePersonalizationCapability('canManageSensitiveProfile'),
  validateBody(ProfileAnswerSchema),
  submitProfileAnswer,
);
router.post(
  '/properties/:propertyId/personalization/recommendations/:recommendationId/actions/convert-to-task',
  requirePersonalizationCapability('canAct'),
  validateBody(ConvertRecommendationToTaskSchema),
  convertPersonalizationRecommendationToTask,
);
router.post(
  '/properties/:propertyId/personalization/recommendations/:recommendationId/feedback',
  requirePersonalizationCapability('canGiveFeedback'),
  validateBody(RecommendationFeedbackSchema),
  submitRecommendationFeedback,
);
router.delete('/properties/:propertyId/personalization/profile', requirePersonalizationCapability('canManageSensitiveProfile'), resetOptionalHouseholdProfile);

export default router;
