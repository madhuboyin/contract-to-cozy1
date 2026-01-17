// apps/backend/src/routes/trueCostOwnership.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { getTrueCostOwnership } from '../controllers/trueCostOwnership.controller';

const router = Router();

// Property scoped tool route
router.get(
  '/properties/:propertyId/tools/true-cost',
  authenticate,
  apiRateLimiter,
  propertyAuthMiddleware,
  getTrueCostOwnership
);

export default router;
