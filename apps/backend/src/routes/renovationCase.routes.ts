import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  propertyAuthMiddleware,
  requireHouseholdRole,
} from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import * as controller from '../controllers/renovationCase.controller';
import {
  AddRenovationCaseParticipantSchema,
  ArchiveRenovationCaseSchema,
  CreateRenovationCaseLinkSchema,
  CreateRenovationCaseSchema,
  CreateRenovationScopeVersionSchema,
  TransitionRenovationCaseSchema,
  UpdateRenovationCaseSchema,
} from '../validators/renovationCase.validators';
import {
  ConvertRenovationOptionSchema,
  CreateRenovationExplorationSchema,
  UpdateRenovationOptionDispositionSchema,
} from '../validators/renovationExplore.validators';
import {
  DetermineRenovationRequirementSchema,
  GenerateRenovationRequirementsSchema,
  UpsertRenovationAuthorityProfileSchema,
} from '../validators/renovationRequirement.validators';
import {
  AttachRenovationComplianceRecordSchema,
  CreateHoaDocumentReviewSchema,
  CreateRenovationComplianceConditionSchema,
  ReviewHoaDocumentExtractionSchema,
  UpdateRenovationComplianceConditionSchema,
} from '../validators/renovationComplianceWorkflow.validators';
import {
  EvaluateRenovationReadinessSchema,
  GovernRenovationReadinessOverrideSchema,
  HandoffRenovationProjectSchema,
  UpdateRenovationReadinessItemSchema,
} from '../validators/renovationReadiness.validators';

const router = Router();
const canContribute = requireHouseholdRole('CONTRIBUTOR');
const ownerOnly = requireHouseholdRole('OWNER');

router.use(apiRateLimiter);
router.use(authenticate);

router.post(
  '/properties/:propertyId/renovation-explorations',
  propertyAuthMiddleware,
  canContribute,
  validateBody(CreateRenovationExplorationSchema),
  controller.createExploration,
);
router.get(
  '/properties/:propertyId/renovation-explorations/:explorationId',
  propertyAuthMiddleware,
  controller.getExploration,
);
router.patch(
  '/properties/:propertyId/renovation-explorations/:explorationId/options/:optionId',
  propertyAuthMiddleware,
  canContribute,
  validateBody(UpdateRenovationOptionDispositionSchema),
  controller.updateOptionDisposition,
);
router.post(
  '/properties/:propertyId/renovation-explorations/:explorationId/options/:optionId/create-case',
  propertyAuthMiddleware,
  canContribute,
  validateBody(ConvertRenovationOptionSchema),
  controller.convertOptionToCase,
);

router.get('/properties/:propertyId/renovation-cases', propertyAuthMiddleware, controller.listCases);
router.post(
  '/properties/:propertyId/renovation-cases',
  propertyAuthMiddleware,
  canContribute,
  validateBody(CreateRenovationCaseSchema),
  controller.createCase,
);
router.get(
  '/properties/:propertyId/renovation-cases/:caseId',
  propertyAuthMiddleware,
  controller.getCase,
);
router.get(
  '/properties/:propertyId/renovation-cases/:caseId/readiness',
  propertyAuthMiddleware,
  controller.getReadiness,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/readiness/evaluate',
  propertyAuthMiddleware,
  canContribute,
  validateBody(EvaluateRenovationReadinessSchema),
  controller.evaluateReadiness,
);
router.patch(
  '/properties/:propertyId/renovation-cases/:caseId/readiness/items/:itemId',
  propertyAuthMiddleware,
  canContribute,
  validateBody(UpdateRenovationReadinessItemSchema),
  controller.updateReadinessItem,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/readiness/items/:itemId/override',
  propertyAuthMiddleware,
  ownerOnly,
  validateBody(GovernRenovationReadinessOverrideSchema),
  controller.governReadinessOverride,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/project-handoff',
  propertyAuthMiddleware,
  ownerOnly,
  validateBody(HandoffRenovationProjectSchema),
  controller.handoffRenovationProject,
);
router.get(
  '/properties/:propertyId/renovation-cases/:caseId/compliance-workflow',
  propertyAuthMiddleware,
  controller.getComplianceWorkflow,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/compliance-records',
  propertyAuthMiddleware,
  canContribute,
  validateBody(AttachRenovationComplianceRecordSchema),
  controller.attachComplianceRecord,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/compliance-conditions',
  propertyAuthMiddleware,
  canContribute,
  validateBody(CreateRenovationComplianceConditionSchema),
  controller.createComplianceCondition,
);
router.patch(
  '/properties/:propertyId/renovation-cases/:caseId/compliance-conditions/:conditionId',
  propertyAuthMiddleware,
  canContribute,
  validateBody(UpdateRenovationComplianceConditionSchema),
  controller.updateComplianceCondition,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/hoa-document-reviews',
  propertyAuthMiddleware,
  canContribute,
  validateBody(CreateHoaDocumentReviewSchema),
  controller.createHoaDocumentReview,
);
router.patch(
  '/properties/:propertyId/renovation-cases/:caseId/hoa-document-reviews/:reviewId',
  propertyAuthMiddleware,
  canContribute,
  validateBody(ReviewHoaDocumentExtractionSchema),
  controller.reviewHoaDocumentExtraction,
);
router.get(
  '/properties/:propertyId/renovation-cases/:caseId/requirements',
  propertyAuthMiddleware,
  controller.listRequirements,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/requirements/generate',
  propertyAuthMiddleware,
  canContribute,
  validateBody(GenerateRenovationRequirementsSchema),
  controller.generateRequirements,
);
router.patch(
  '/properties/:propertyId/renovation-cases/:caseId/requirements/:requirementId',
  propertyAuthMiddleware,
  canContribute,
  validateBody(DetermineRenovationRequirementSchema),
  controller.determineRequirement,
);
router.get(
  '/properties/:propertyId/renovation-cases/:caseId/authority-profiles',
  propertyAuthMiddleware,
  controller.listAuthorityProfiles,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/authority-profiles',
  propertyAuthMiddleware,
  canContribute,
  validateBody(UpsertRenovationAuthorityProfileSchema),
  controller.createAuthorityProfile,
);
router.patch(
  '/properties/:propertyId/renovation-cases/:caseId',
  propertyAuthMiddleware,
  canContribute,
  validateBody(UpdateRenovationCaseSchema),
  controller.updateCase,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/transition',
  propertyAuthMiddleware,
  canContribute,
  validateBody(TransitionRenovationCaseSchema),
  controller.transitionCase,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/archive',
  propertyAuthMiddleware,
  ownerOnly,
  validateBody(ArchiveRenovationCaseSchema),
  controller.archiveCase,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/scopes',
  propertyAuthMiddleware,
  canContribute,
  validateBody(CreateRenovationScopeVersionSchema),
  controller.createScopeVersion,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/links',
  propertyAuthMiddleware,
  canContribute,
  validateBody(CreateRenovationCaseLinkSchema),
  controller.createLink,
);
router.delete(
  '/properties/:propertyId/renovation-cases/:caseId/links/:linkId',
  propertyAuthMiddleware,
  canContribute,
  controller.deleteLink,
);
router.post(
  '/properties/:propertyId/renovation-cases/:caseId/participants',
  propertyAuthMiddleware,
  ownerOnly,
  validateBody(AddRenovationCaseParticipantSchema),
  controller.addParticipant,
);
router.delete(
  '/properties/:propertyId/renovation-cases/:caseId/participants/:participantId',
  propertyAuthMiddleware,
  ownerOnly,
  controller.removeParticipant,
);
router.get(
  '/properties/:propertyId/renovation-cases/:caseId/events',
  propertyAuthMiddleware,
  controller.listEvents,
);

export default router;
