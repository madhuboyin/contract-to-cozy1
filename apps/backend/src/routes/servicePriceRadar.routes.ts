import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  createServicePriceRadarCheck,
  getServicePriceRadarCheckDetail,
  listServicePriceRadarChecks,
  trackServicePriceRadarEvent,
} from '../controllers/servicePriceRadar.controller';
import {
  createServicePriceRadarBodySchema,
  trackServicePriceRadarEventBodySchema,
} from '../validators/servicePriceRadar.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/service-price-radar/checks',
  propertyAuthMiddleware,
  listServicePriceRadarChecks
);

router.get(
  '/properties/:propertyId/service-price-radar/checks/:checkId',
  propertyAuthMiddleware,
  getServicePriceRadarCheckDetail
);

router.post(
  '/properties/:propertyId/service-price-radar/events',
  propertyAuthMiddleware,
  validateBody(trackServicePriceRadarEventBodySchema),
  trackServicePriceRadarEvent
);

router.post(
  '/properties/:propertyId/service-price-radar/checks',
  propertyAuthMiddleware,
  validateBody(createServicePriceRadarBodySchema),
  createServicePriceRadarCheck
);

export default router;
