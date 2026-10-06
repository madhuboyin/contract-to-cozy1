// apps/backend/src/routes/diy.routes.ts
import { Router } from 'express';
import { authenticate, requireMfa } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { validateBody, validate } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { UserRole } from '../types/auth.types';

import {
  getSkillProfile,
  upsertSkillProfile,
  listTemplates,
  getFeaturedTemplates,
  getTemplateDetail,
  getDiyDecision,
  createProject,
  listProjects,
  getProject,
  updateProject,
  updateStep,
  completeProject,
  retryCompletionEffects,
  retryTaskReconciliation,
  abandonProject,
  generateAiGuide,
  getAiGuide,
  adminListTemplates,
  adminGetTemplate,
  adminCreateTemplate,
  adminUpdateTemplate,
} from '../controllers/diy.controller';

import {
  UpsertSkillProfileSchema,
  ListTemplatesSchema,
  DiyDecisionSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  UpdateStepSchema,
  CompleteProjectSchema,
  AbandonProjectSchema,
  GenerateAiGuideSchema,
  ListProjectsSchema,
  AdminCreateTemplateSchema,
  AdminUpdateTemplateSchema,
} from '../validators/diy.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ── Skill Profile ─────────────────────────────────────────────────────────────
router.get('/diy/skill-profile', getSkillProfile);
router.put('/diy/skill-profile', validateBody(UpsertSkillProfileSchema), upsertSkillProfile);

// ── Template Library ──────────────────────────────────────────────────────────
router.get('/diy/templates', validate(ListTemplatesSchema.transform((q) => ({ query: q }))), listTemplates);
router.get('/diy/templates/featured', getFeaturedTemplates);
router.get('/diy/templates/:templateId', getTemplateDetail);

// ── Decision Engine ────────────────────────────────────────────────────────────
router.post('/properties/:propertyId/diy/decision', propertyAuthMiddleware, validateBody(DiyDecisionSchema), getDiyDecision);

// ── Projects ──────────────────────────────────────────────────────────────────
// Every route that creates or changes project data requires the CONTRIBUTOR household role (propertyAuthMiddleware only resolves access, so
// without the floor a VIEWER could mutate through the API). The floor sits right after property auth so a viewer is refused before validation.
router.post('/properties/:propertyId/diy/projects', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), validateBody(CreateProjectSchema), createProject);
router.get('/properties/:propertyId/diy/projects', propertyAuthMiddleware, validate(ListProjectsSchema.transform((q) => ({ query: q }))), listProjects);
router.get('/properties/:propertyId/diy/projects/:projectId', propertyAuthMiddleware, getProject);
router.patch('/properties/:propertyId/diy/projects/:projectId', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), validateBody(UpdateProjectSchema), updateProject);
router.patch('/properties/:propertyId/diy/projects/:projectId/steps/:stepId', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), validateBody(UpdateStepSchema), updateStep);
router.post('/properties/:propertyId/diy/projects/:projectId/complete', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), validateBody(CompleteProjectSchema), completeProject);
router.post('/properties/:propertyId/diy/projects/:projectId/completion-effects/retry', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), retryCompletionEffects);
router.post('/properties/:propertyId/diy/projects/:projectId/task-reconciliation/retry', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), retryTaskReconciliation);
router.post('/properties/:propertyId/diy/projects/:projectId/abandon', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), validateBody(AbandonProjectSchema), abandonProject);

// ── AI Guide ──────────────────────────────────────────────────────────────────
// Generating a guide stores a DiyAiGuide for the property and spends AI budget, so it is a property write too.
router.post('/properties/:propertyId/diy/ai-guide', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), validateBody(GenerateAiGuideSchema), generateAiGuide);
router.get('/properties/:propertyId/diy/ai-guide/:guideId', propertyAuthMiddleware, getAiGuide);

// ── Admin ─────────────────────────────────────────────────────────────────────
// MFA + capability gate applied per-route (this file also serves non-admin
// homeowner routes above, so it cannot use a single router.use() prefix gate).
const requireDiyAdmin = [requireRole(UserRole.ADMIN), requireMfa, requireCapability('CONTENT_AUTHOR' as const)];
router.get('/admin/diy/templates', ...requireDiyAdmin, adminListTemplates);
router.get('/admin/diy/templates/:templateId', ...requireDiyAdmin, adminGetTemplate);
router.post('/admin/diy/templates', ...requireDiyAdmin, validateBody(AdminCreateTemplateSchema), adminCreateTemplate);
router.put('/admin/diy/templates/:templateId', ...requireDiyAdmin, validateBody(AdminUpdateTemplateSchema), adminUpdateTemplate);
// Direct status changes were removed (ADMIN_MODULE_FRD.md §10.6): DIY
// lifecycle now moves only through the capability-separated transitions in
// adminContentGovernance.routes.ts (/api/admin/content/diy/...).

export default router;
