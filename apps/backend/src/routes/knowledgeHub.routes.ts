import { Router } from 'express';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  getPublishedKnowledgeArticle,
  listPublishedKnowledgeArticles,
  listTargetedKnowledgeArticles,
} from '../controllers/knowledgeHub.controller';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';

const router = Router();

router.use(apiRateLimiter);

router.get('/knowledge/articles', listPublishedKnowledgeArticles);
router.get(
  '/properties/:propertyId/knowledge/articles',
  authenticate,
  propertyAuthMiddleware,
  listTargetedKnowledgeArticles,
);
router.get('/knowledge/articles/:slug', getPublishedKnowledgeArticle);

export default router;
