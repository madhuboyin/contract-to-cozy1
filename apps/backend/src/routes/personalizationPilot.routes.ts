import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  getPilot,
  optInPilot,
  resetPilot,
  refreshPilot,
  submitPilotFeedback,
  submitPilotProfileAnswer,
  getPilotModuleRecommendations,
  convertPilotRecommendationToTask,
} from '../modules/personalization/api/personalizationPilot.controller';
import {
  PilotFeedbackSchema,
  PilotOptInSchema,
  PilotProfileAnswerSchema,
  ConvertRecommendationToTaskSchema,
} from '../modules/personalization/api/personalizationPilot.validators';
import { requirePersonalizationCapability } from '../modules/personalization/api/personalizationCapability.middleware';

const router = Router();
router.use(apiRateLimiter);
router.use(authenticate);
router.use('/properties/:propertyId/personalization', propertyAuthMiddleware);

router.get('/properties/:propertyId/personalization', requirePersonalizationCapability('canViewOrdinaryRecommendations'), getPilot);
router.post('/properties/:propertyId/personalization/opt-in', requirePersonalizationCapability('canManageSensitiveProfile'), validateBody(PilotOptInSchema), optInPilot);
router.post('/properties/:propertyId/personalization/refresh', requirePersonalizationCapability('canAct'), refreshPilot);
router.get(
  '/properties/:propertyId/personalization/modules/:module/recommendations',
  requirePersonalizationCapability('canViewOrdinaryRecommendations'),
  getPilotModuleRecommendations,
);
router.post(
  '/properties/:propertyId/personalization/questions/:questionId/answers',
  requirePersonalizationCapability('canManageSensitiveProfile'),
  validateBody(PilotProfileAnswerSchema),
  submitPilotProfileAnswer,
);
router.post(
  '/properties/:propertyId/personalization/recommendations/:recommendationId/actions/convert-to-task',
  requirePersonalizationCapability('canAct'),
  validateBody(ConvertRecommendationToTaskSchema),
  convertPilotRecommendationToTask,
);
router.post(
  '/properties/:propertyId/personalization/recommendations/:recommendationId/feedback',
  requirePersonalizationCapability('canGiveFeedback'),
  validateBody(PilotFeedbackSchema),
  submitPilotFeedback,
);
router.delete('/properties/:propertyId/personalization', requirePersonalizationCapability('canManageSensitiveProfile'), resetPilot);

export default router;
