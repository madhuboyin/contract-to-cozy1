import { Router } from 'express';
import { getOrCreateWorkspace } from '../controllers/quoteComparison.controller';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { getOrCreateQuoteWorkspaceSchema } from '../validators/quoteComparison.validators';

const router = Router();
router.use(apiRateLimiter);
router.use(authenticate);

router.post(
  '/properties/:propertyId/quote-comparison/workspaces',
  propertyAuthMiddleware,
  validateBody(getOrCreateQuoteWorkspaceSchema),
  getOrCreateWorkspace,
);

export default router;
