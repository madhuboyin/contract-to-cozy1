import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.all('/properties/:propertyId/home-score/*', propertyAuthMiddleware, (req, res) => {
  return res.status(410).json({
    success: false,
    error: {
      code: 'HOME_SCORE_RETIRED',
      message: 'Composite Home Score reports, grades, trends, benchmarks, and parallel action panels are retired.',
      replacement: `/api/properties/${req.params.propertyId}/property-briefs`,
    },
  });
});

export default router;
