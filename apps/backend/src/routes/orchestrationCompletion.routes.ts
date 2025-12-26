// apps/backend/src/routes/orchestrationCompletion.routes.ts
import { Router } from 'express';
import {
  getCompletionHandler,
  updateCompletionHandler,
  uploadPhotoHandler,
  deletePhotoHandler,
  uploadMiddleware,
} from '../controllers/orchestrationCompletion.controller';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';

const router = Router();

// GET /api/orchestration/:propertyId/completions/:completionId
router.get(
  '/:propertyId/completions/:completionId',
  authenticate,
  propertyAuthMiddleware,
  getCompletionHandler
);

// PUT /api/orchestration/:propertyId/completions/:completionId
router.put(
  '/:propertyId/completions/:completionId',
  authenticate,
  propertyAuthMiddleware,
  updateCompletionHandler
);

// POST /api/orchestration/:propertyId/completions/photos
router.post(
  '/:propertyId/completions/photos',
  authenticate,
  propertyAuthMiddleware,
  uploadMiddleware,
  uploadPhotoHandler
);

// DELETE /api/orchestration/:propertyId/completions/photos/:photoId
router.delete(
  '/:propertyId/completions/photos/:photoId',
  authenticate,
  propertyAuthMiddleware,
  deletePhotoHandler
);

export default router;