// apps/backend/src/routes/orchestration.routes.ts

import { Router } from 'express';
import {
  getOrchestrationSummaryHandler,
  markOrchestrationActionCompleted,
  snoozeOrchestrationAction,
  undoOrchestrationAction,
  unsnoozeOrchestrationAction,
} from '../controllers/orchestration.controller';

import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import completionRoutes from './orchestrationCompletion.routes';

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

// POST /api/orchestration/:propertyId/actions/:actionKey/snooze
router.post(
  '/:propertyId/actions/:actionKey/snooze',
  authenticate,
  propertyAuthMiddleware,
  snoozeOrchestrationAction
);

// POST /api/orchestration/:propertyId/actions/:actionKey/unsnooze
router.post(
  '/:propertyId/actions/:actionKey/unsnooze',
  authenticate,
  propertyAuthMiddleware,
  unsnoozeOrchestrationAction
);
// Mount completion routes
router.use('/', completionRoutes);
export default router;
