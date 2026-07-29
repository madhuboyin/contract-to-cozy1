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

const router = Router();
const canContribute = requireHouseholdRole('CONTRIBUTOR');
const ownerOnly = requireHouseholdRole('OWNER');

router.use(apiRateLimiter);
router.use(authenticate);

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
