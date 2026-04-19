import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { trackRouteRedirectEvent } from '../controllers/navigationAnalytics.controller';

const router = Router();

const routeRedirectBodySchema = z.object({
  oldRoute: z.string().min(1).max(320),
  canonicalRoute: z.string().min(1).max(480),
  redirectType: z.string().min(1).max(80).optional(),
  navTarget: z.string().min(1).max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.use(apiRateLimiter);
router.use(authenticate);

router.post(
  '/properties/:propertyId/navigation/route-redirects',
  propertyAuthMiddleware,
  validateBody(routeRedirectBodySchema),
  trackRouteRedirectEvent
);

export default router;
