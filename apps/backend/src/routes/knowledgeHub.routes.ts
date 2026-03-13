import { Router } from 'express';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  getPublishedKnowledgeArticle,
  listPublishedKnowledgeArticles,
} from '../controllers/knowledgeHub.controller';

const router = Router();

router.use(apiRateLimiter);

router.get('/knowledge/articles', listPublishedKnowledgeArticles);
router.get('/knowledge/articles/:slug', getPublishedKnowledgeArticle);

export default router;
