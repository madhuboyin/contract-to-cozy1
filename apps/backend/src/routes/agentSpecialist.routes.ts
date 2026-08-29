import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { invokeHvacSpecialistHandler } from '../controllers/agentSpecialist.controller';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// §7.4 — one endpoint, the closed operation set (START_OR_RESUME,
// SUBMIT_CONTEXT, DISPUTE_INPUT, GET_STATUS). Ask and the in-app Home Action
// surface both call this same operation.
router.post(
  '/properties/:propertyId/agents/hvac-repair-replace/:operation',
  propertyAuthMiddleware,
  invokeHvacSpecialistHandler,
);

export default router;
