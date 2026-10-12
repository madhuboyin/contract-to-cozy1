import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  createPriceFinalizationDraft,
  finalizePriceFinalization,
  getPriceFinalizationDetail,
  listPriceFinalizations,
  updatePriceFinalizationDraft,
} from '../controllers/priceFinalization.controller';
import {
  createPriceFinalizationBodySchema,
  finalizePriceFinalizationBodySchema,
  priceFinalizationDetailParamsSchema,
  priceFinalizationPropertyParamsSchema,
  updatePriceFinalizationBodySchema,
} from '../validators/priceFinalization.validators';

// Reads stay at VIEWER. Every route that writes (and the ones that fetch or generate on the household's behalf) requires at least CONTRIBUTOR:
// propertyAuthMiddleware only proves membership, so without the floor a VIEWER could change shared records over HTTP.
const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/price-finalizations',
  propertyAuthMiddleware,
  validate(priceFinalizationPropertyParamsSchema),
  listPriceFinalizations
);

router.post(
  '/properties/:propertyId/price-finalizations',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validate(priceFinalizationPropertyParamsSchema),
  validateBody(createPriceFinalizationBodySchema),
  createPriceFinalizationDraft
);

router.get(
  '/properties/:propertyId/price-finalizations/:finalizationId',
  propertyAuthMiddleware,
  validate(priceFinalizationDetailParamsSchema),
  getPriceFinalizationDetail
);

router.put(
  '/properties/:propertyId/price-finalizations/:finalizationId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validate(priceFinalizationDetailParamsSchema),
  validateBody(updatePriceFinalizationBodySchema),
  updatePriceFinalizationDraft
);

router.post(
  '/properties/:propertyId/price-finalizations/:finalizationId/finalize',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validate(priceFinalizationDetailParamsSchema),
  validateBody(finalizePriceFinalizationBodySchema),
  finalizePriceFinalization
);

export default router;
