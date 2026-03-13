import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  attachNegotiationShieldDocumentMetadata,
  createNegotiationShieldCase,
  getNegotiationShieldCaseDetail,
  listNegotiationShieldCases,
  saveNegotiationShieldManualInput,
} from '../controllers/negotiationShield.controller';
import {
  attachNegotiationShieldDocumentBodySchema,
  createNegotiationShieldCaseBodySchema,
  negotiationShieldCaseParamsSchema,
  negotiationShieldPropertyParamsSchema,
  saveNegotiationShieldInputBodySchema,
} from '../validators/negotiationShield.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/negotiation-shield/cases',
  propertyAuthMiddleware,
  validate(negotiationShieldPropertyParamsSchema),
  listNegotiationShieldCases
);

router.post(
  '/properties/:propertyId/negotiation-shield/cases',
  propertyAuthMiddleware,
  validate(negotiationShieldPropertyParamsSchema),
  validateBody(createNegotiationShieldCaseBodySchema),
  createNegotiationShieldCase
);

router.get(
  '/properties/:propertyId/negotiation-shield/cases/:caseId',
  propertyAuthMiddleware,
  validate(negotiationShieldCaseParamsSchema),
  getNegotiationShieldCaseDetail
);

router.put(
  '/properties/:propertyId/negotiation-shield/cases/:caseId/input',
  propertyAuthMiddleware,
  validate(negotiationShieldCaseParamsSchema),
  validateBody(saveNegotiationShieldInputBodySchema),
  saveNegotiationShieldManualInput
);

router.post(
  '/properties/:propertyId/negotiation-shield/cases/:caseId/documents',
  propertyAuthMiddleware,
  validate(negotiationShieldCaseParamsSchema),
  validateBody(attachNegotiationShieldDocumentBodySchema),
  attachNegotiationShieldDocumentMetadata
);

export default router;
