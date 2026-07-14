import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { requireRole } from '../middleware/householdRole.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  getPilot,
  optInPilot,
  resetPilot,
  submitPilotFeedback,
  submitPilotProfileAnswer,
} from '../modules/personalization/api/personalizationPilot.controller';
import {
  PilotFeedbackSchema,
  PilotOptInSchema,
  PilotProfileAnswerSchema,
} from '../modules/personalization/api/personalizationPilot.validators';

const router = Router();
router.use(apiRateLimiter);
router.use(authenticate);
router.use('/properties/:propertyId/personalization', propertyAuthMiddleware, requireRole('OWNER'));

router.get('/properties/:propertyId/personalization', getPilot);
router.post('/properties/:propertyId/personalization/opt-in', validateBody(PilotOptInSchema), optInPilot);
router.post(
  '/properties/:propertyId/personalization/questions/:questionId/answers',
  validateBody(PilotProfileAnswerSchema),
  submitPilotProfileAnswer,
);
router.post(
  '/properties/:propertyId/personalization/recommendations/:recommendationId/feedback',
  validateBody(PilotFeedbackSchema),
  submitPilotFeedback,
);
router.delete('/properties/:propertyId/personalization', resetPilot);

export default router;
