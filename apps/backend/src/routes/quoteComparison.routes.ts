import { Router } from 'express';
import {
  addQuoteFromDocument,
  addQuoteProposal,
  confirmQuote,
  getComparability,
  getQuoteReviewHandler,
  getOrCreateWorkspace,
  lookupWorkspace,
  getWorkspace,
  addContextLink,
  selectQuote,
  transitionDecision,
  updateQuote,
  addClarification,
  deleteQuote,
  resolveClarification,
  setQuoteDisposition,
  updateOutcomeMeasurementConsent,
} from '../controllers/quoteComparison.controller';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  confirmQuoteReviewSchema,
  createQuoteFromDocumentSchema,
  createQuoteProposalSchema,
  getOrCreateQuoteWorkspaceSchema,
  updateQuoteProposalSchema,
  quoteDecisionContextLinkSchema,
  selectQuoteSchema,
  transitionQuoteDecisionSchema,
  createQuoteClarificationSchema,
  quoteDispositionSchema,
  resolveQuoteClarificationSchema,
  serviceQuoteOutcomeConsentSchema,
} from '../validators/quoteComparison.validators';

const router = Router();
router.use(apiRateLimiter);
router.use(authenticate);

// Creating a workspace writes, so it needs CONTRIBUTOR; a viewer opens the page through the read-only lookup, which must stay registered BEFORE
// '/workspaces/:workspaceId' so 'lookup' is not taken for a workspace id.
router.post(
  '/properties/:propertyId/quote-comparison/workspaces',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(getOrCreateQuoteWorkspaceSchema),
  getOrCreateWorkspace,
);

router.get(
  '/properties/:propertyId/quote-comparison/workspaces/lookup',
  propertyAuthMiddleware,
  lookupWorkspace,
);

router.get(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId',
  propertyAuthMiddleware,
  getWorkspace,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/outcome-measurement-consent',
  propertyAuthMiddleware,
  requireHouseholdRole('OWNER'),
  validateBody(serviceQuoteOutcomeConsentSchema),
  updateOutcomeMeasurementConsent,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(createQuoteProposalSchema),
  addQuoteProposal,
);

router.patch(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/:quoteId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(updateQuoteProposalSchema),
  updateQuote,
);

router.delete(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/:quoteId',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  deleteQuote,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/:quoteId/disposition',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(quoteDispositionSchema),
  setQuoteDisposition,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/:quoteId/clarifications',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(createQuoteClarificationSchema),
  addClarification,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/:quoteId/clarifications/:clarificationId/resolve',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(resolveQuoteClarificationSchema),
  resolveClarification,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/from-document',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(createQuoteFromDocumentSchema),
  addQuoteFromDocument,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/:quoteId/confirm',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(confirmQuoteReviewSchema),
  confirmQuote,
);

// What a confirmation would affirm: every value, its state and a fingerprint of that set (FRD v1.360).
router.get(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/:quoteId/review',
  propertyAuthMiddleware,
  getQuoteReviewHandler,
);

router.get(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/comparability',
  propertyAuthMiddleware,
  getComparability,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/selection',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(selectQuoteSchema),
  selectQuote,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/transitions',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(transitionQuoteDecisionSchema),
  transitionDecision,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/context-links',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(quoteDecisionContextLinkSchema),
  addContextLink,
);

export default router;
