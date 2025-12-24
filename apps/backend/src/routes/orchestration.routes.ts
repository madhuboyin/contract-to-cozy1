// apps/backend/src/routes/orchestration.routes.ts
import { Router } from 'express';
import { getOrchestrationSummaryHandler, markOrchestrationActionCompleted, unmarkOrchestrationActionComplete } from '../controllers/orchestration.controller';

// Use your actual auth middleware import path
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';

const router = Router();

// GET /api/orchestration/summary/:propertyId
router.get(
  '/summary/:propertyId',
  authenticate,
  propertyAuthMiddleware,
  getOrchestrationSummaryHandler
);

router.post(
  '/actions/mark-completed',
  authenticate,
  markOrchestrationActionCompleted
);

router.post(
  '/actions/unmark-complete',
  authenticate,
  unmarkOrchestrationActionComplete
);

export default router;
