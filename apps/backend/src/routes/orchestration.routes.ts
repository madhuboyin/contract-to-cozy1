// apps/backend/src/routes/orchestration.routes.ts

import { Router } from 'express';
import {
  getOrchestrationSummaryHandler,
  markOrchestrationActionCompleted,
  undoOrchestrationAction,
} from '../controllers/orchestration.controller';

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

// POST /api/orchestration/actions/mark-completed
router.post(
  '/:propertyId/actions/mark-completed',
  authenticate,
  propertyAuthMiddleware,
  markOrchestrationActionCompleted
);

// POST /api/orchestration/:propertyId/actions/:actionKey/undo
router.post(
  '/:propertyId/actions/:actionKey/undo',
  authenticate,
  propertyAuthMiddleware,
  undoOrchestrationAction
);

export default router;
