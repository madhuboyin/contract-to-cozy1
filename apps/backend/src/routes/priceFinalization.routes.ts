import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
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
  validate(priceFinalizationDetailParamsSchema),
  validateBody(updatePriceFinalizationBodySchema),
  updatePriceFinalizationDraft
);

router.post(
  '/properties/:propertyId/price-finalizations/:finalizationId/finalize',
  propertyAuthMiddleware,
  validate(priceFinalizationDetailParamsSchema),
  validateBody(finalizePriceFinalizationBodySchema),
  finalizePriceFinalization
);

export default router;
