import { Router } from 'express';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
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

// CONTENT_AUTHOR gates the whole router for now — author/review/publish are
// not yet separate workflows here (that separation is Phase 4, per
// ADMIN_MODULE_FRD.md §10.6); this endpoint set does both today.
router.use('/knowledge/admin', authenticate, requireMfa, requireRole(UserRole.ADMIN), requireCapability('CONTENT_AUTHOR'));

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
