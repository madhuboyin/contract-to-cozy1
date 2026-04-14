import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  createKnowledgeArticle,
  getKnowledgeArticleForAdmin,
  getKnowledgeEditorOptions,
  listKnowledgeArticlesForAdmin,
  updateKnowledgeArticle,
} from '../controllers/knowledgeHubAdmin.controller';
import {
  knowledgeArticleIdParamsSchema,
  knowledgeArticleUpsertSchema,
} from '../validators/knowledgeHubAdmin.validators';

const router = Router();

router.use(apiRateLimiter);
router.use('/knowledge/admin', authenticate, requireMfa, requireRole(UserRole.ADMIN));

router.get('/knowledge/admin/options', getKnowledgeEditorOptions);
router.get('/knowledge/admin/articles', listKnowledgeArticlesForAdmin);
router.get('/knowledge/admin/articles/:id', validate(knowledgeArticleIdParamsSchema), getKnowledgeArticleForAdmin);
router.post('/knowledge/admin/articles', validateBody(knowledgeArticleUpsertSchema), createKnowledgeArticle);
router.put(
  '/knowledge/admin/articles/:id',
  validate(knowledgeArticleIdParamsSchema),
  validateBody(knowledgeArticleUpsertSchema),
  updateKnowledgeArticle
);

export default router;
