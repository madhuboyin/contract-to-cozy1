import { Router } from 'express';
import {
  addQuoteFromDocument,
  addQuoteProposal,
  confirmQuote,
  getComparability,
  getOrCreateWorkspace,
  getWorkspace,
  addContextLink,
  selectQuote,
  transitionDecision,
  updateQuote,
} from '../controllers/quoteComparison.controller';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  createQuoteFromDocumentSchema,
  createQuoteProposalSchema,
  getOrCreateQuoteWorkspaceSchema,
  updateQuoteProposalSchema,
  quoteDecisionContextLinkSchema,
  selectQuoteSchema,
  transitionQuoteDecisionSchema,
} from '../validators/quoteComparison.validators';

const router = Router();
router.use(apiRateLimiter);
router.use(authenticate);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces',
  propertyAuthMiddleware,
  validateBody(getOrCreateQuoteWorkspaceSchema),
  getOrCreateWorkspace,
);

router.get(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId',
  propertyAuthMiddleware,
  getWorkspace,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes',
  propertyAuthMiddleware,
  validateBody(createQuoteProposalSchema),
  addQuoteProposal,
);

router.patch(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/:quoteId',
  propertyAuthMiddleware,
  validateBody(updateQuoteProposalSchema),
  updateQuote,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/from-document',
  propertyAuthMiddleware,
  validateBody(createQuoteFromDocumentSchema),
  addQuoteFromDocument,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/quotes/:quoteId/confirm',
  propertyAuthMiddleware,
  confirmQuote,
);

router.get(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/comparability',
  propertyAuthMiddleware,
  getComparability,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/selection',
  propertyAuthMiddleware,
  validateBody(selectQuoteSchema),
  selectQuote,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/transitions',
  propertyAuthMiddleware,
  validateBody(transitionQuoteDecisionSchema),
  transitionDecision,
);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces/:workspaceId/context-links',
  propertyAuthMiddleware,
  validateBody(quoteDecisionContextLinkSchema),
  addContextLink,
);

export default router;
