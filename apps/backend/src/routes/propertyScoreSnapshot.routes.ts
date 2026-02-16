import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { getPropertyScoreSnapshots } from '../controllers/propertyScoreSnapshot.controller';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/score-snapshots',
  propertyAuthMiddleware,
  getPropertyScoreSnapshots
);

export default router;
