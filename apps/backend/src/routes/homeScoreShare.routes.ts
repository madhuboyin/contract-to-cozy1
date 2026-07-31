import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

router.use(apiRateLimiter);

router.all(
  '/properties/:propertyId/home-score/:legacyAction',
  authenticate,
  propertyAuthMiddleware,
  (req, res) => res.status(410).json({
    success: false,
    error: {
      code: 'HOME_SCORE_SHARING_RETIRED',
      message: 'Ungoverned Home Score and buyer-report sharing are retired.',
      replacement: `/api/properties/${req.params.propertyId}/property-briefs`,
    },
  }),
);

router.get('/home-score/share/:token', (_req, res) => res.status(410).json({
  success: false,
  error: {
    code: 'HOME_SCORE_PUBLIC_SHARE_RETIRED',
    message: 'This legacy Home Score share is no longer available.',
  },
}));

export default router;
