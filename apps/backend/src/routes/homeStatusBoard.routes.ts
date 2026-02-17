import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { patchItemStatusBodySchema } from '../validators/homeStatusBoard.validators';
import { getBoard, recompute, patchStatus } from '../controllers/homeStatusBoard.controller';

const router = Router();

// GET /api/properties/:propertyId/status-board
router.get(
  '/properties/:propertyId/status-board',
  apiRateLimiter,
  authenticate,
  propertyAuthMiddleware,
  getBoard
);

// POST /api/properties/:propertyId/status-board/recompute
router.post(
  '/properties/:propertyId/status-board/recompute',
  apiRateLimiter,
  authenticate,
  propertyAuthMiddleware,
  recompute
);

// PATCH /api/properties/:propertyId/status-board/:homeItemId
router.patch(
  '/properties/:propertyId/status-board/:homeItemId',
  apiRateLimiter,
  authenticate,
  propertyAuthMiddleware,
  validateBody(patchItemStatusBodySchema),
  patchStatus
);

export default router;
