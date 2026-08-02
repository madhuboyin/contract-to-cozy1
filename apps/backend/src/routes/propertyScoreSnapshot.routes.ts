import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/score-snapshots',
  propertyAuthMiddleware,
  (_req, res) => {
    res.status(410).json({
      success: false,
      code: 'COMPOSITE_HOME_SCORE_RETIRED',
      message: 'Composite Home Score trends have been retired.',
      replacements: {
        currentStatus: '/api/properties/:propertyId/status-board',
        shareableRecord: '/api/properties/:propertyId/property-briefs',
      },
    });
  },
);

export default router;
