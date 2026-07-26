import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  getRadarEvent,
  triggerEventMatching,
  upsertRadarEvent,
} from '../controllers/homeEventRadar.controller';
import {
  triggerMatchBodySchema,
  upsertRadarEventBodySchema,
} from '../validators/homeEventRadar.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(
  '/admin/radar',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('INTEGRATION_MANAGE'),
);

/**
 * Temporary pre-canonical-ingestion operations surface.
 *
 * These endpoints remain available for controlled QA and operator repair
 * while the durable provider-ingestion pipeline is implemented. They are not
 * a provider API and must never be mounted on homeowner-authenticated routes.
 */
router.post(
  '/admin/radar/events',
  validateBody(upsertRadarEventBodySchema),
  upsertRadarEvent,
);

router.post(
  '/admin/radar/events/:eventId/match',
  validateBody(triggerMatchBodySchema),
  triggerEventMatching,
);

router.get('/admin/radar/events/:eventId', getRadarEvent);

export default router;
