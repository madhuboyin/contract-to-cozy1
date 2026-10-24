// apps/backend/src/routes/homeReserveFund.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { validateBody, validate } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

import {
  getFund,
  updateFund,
  recalculateFund,
  listLineItems,
  retireLineItem,
  confirmLineItemAllocation,
  listContributions,
  addContribution,
  removeContribution,
  listReconciliationSuggestions,
  acceptReconciliationMatch,
} from '../controllers/homeReserveFund.controller';

import {
  updateFundBodySchema,
  listLineItemsQuerySchema,
  retireLineItemBodySchema,
  confirmAllocationBodySchema,
  listContributionsQuerySchema,
  addContributionBodySchema,
  acceptReconciliationMatchBodySchema,
} from '../validators/homeReserveFund.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// Fund
router.get('/properties/:propertyId/reserve-fund', propertyAuthMiddleware, getFund);

router.patch(
  '/properties/:propertyId/reserve-fund',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(updateFundBodySchema),
  updateFund,
);

router.post(
  '/properties/:propertyId/reserve-fund/recalculate',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  recalculateFund,
);

// Line items
router.get(
  '/properties/:propertyId/reserve-fund/line-items',
  propertyAuthMiddleware,
  validate(listLineItemsQuerySchema.transform((query) => ({ query }))),
  listLineItems,
);

router.post(
  '/properties/:propertyId/reserve-fund/line-items/:lineItemId/confirm-allocation',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(confirmAllocationBodySchema),
  confirmLineItemAllocation,
);

router.post(
  '/properties/:propertyId/reserve-fund/line-items/:lineItemId/retire',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(retireLineItemBodySchema),
  retireLineItem,
);

// Contributions
router.get(
  '/properties/:propertyId/reserve-fund/contributions',
  propertyAuthMiddleware,
  validate(listContributionsQuerySchema.transform((query) => ({ query }))),
  listContributions,
);

router.post(
  '/properties/:propertyId/reserve-fund/contributions',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(addContributionBodySchema),
  addContribution,
);

router.delete(
  '/properties/:propertyId/reserve-fund/contributions/:contributionId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  removeContribution,
);

// Reconciliation suggestions (computed live — see Phase 1 note in
// homeReserveFundReconciliation.service.ts)
router.get(
  '/properties/:propertyId/reserve-fund/reconciliation-suggestions',
  propertyAuthMiddleware,
  listReconciliationSuggestions,
);

router.post(
  '/properties/:propertyId/reserve-fund/reconciliation-suggestions/accept',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(acceptReconciliationMatchBodySchema),
  acceptReconciliationMatch,
);

export default router;
