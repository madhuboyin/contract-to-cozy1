import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  analyzeNegotiationShieldCase,
  attachNegotiationShieldDocumentMetadata,
  createNegotiationShieldCase,
  getNegotiationShieldCaseDetail,
  listNegotiationShieldCases,
  parseNegotiationShieldDocument,
  recordBuyerNegotiationOutcome,
  saveNegotiationShieldManualInput,
  startBuyerNegotiation,
  trackNegotiationShieldEvent,
} from '../controllers/negotiationShield.controller';
import {
  attachNegotiationShieldDocumentBodySchema,
  createNegotiationShieldCaseBodySchema,
  negotiationShieldCaseParamsSchema,
  negotiationShieldCaseDocumentParamsSchema,
  negotiationShieldPropertyParamsSchema,
  saveNegotiationShieldInputBodySchema,
  startBuyerNegotiationBodySchema,
  recordBuyerNegotiationOutcomeBodySchema,
  trackNegotiationShieldEventBodySchema,
} from '../validators/negotiationShield.validators';

// Reads (the case list and one case) stay at VIEWER. Every route that writes a case, input, document link, parsed input or analysis, and the
// buyer-negotiation writes, requires at least CONTRIBUTOR: propertyAuthMiddleware only proves membership, so without the floor a VIEWER could
// mutate a shared case over HTTP. POST /events records tool analytics, not a case, and stays at VIEWER so a read-only member's page can report.
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
  '/properties/:propertyId/negotiation-shield/events',
  propertyAuthMiddleware,
  validate(negotiationShieldPropertyParamsSchema),
  validateBody(trackNegotiationShieldEventBodySchema),
  trackNegotiationShieldEvent
);

router.post(
  '/properties/:propertyId/negotiation-shield/buyer-cases',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validate(negotiationShieldPropertyParamsSchema),
  validateBody(startBuyerNegotiationBodySchema),
  startBuyerNegotiation,
);

router.put(
  '/properties/:propertyId/negotiation-shield/cases/:caseId/buyer-outcome',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validate(negotiationShieldCaseParamsSchema),
  validateBody(recordBuyerNegotiationOutcomeBodySchema),
  recordBuyerNegotiationOutcome,
);

router.post(
  '/properties/:propertyId/negotiation-shield/cases',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
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
  requireHouseholdRole('CONTRIBUTOR'),
  validate(negotiationShieldCaseParamsSchema),
  validateBody(saveNegotiationShieldInputBodySchema),
  saveNegotiationShieldManualInput
);

router.post(
  '/properties/:propertyId/negotiation-shield/cases/:caseId/documents',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validate(negotiationShieldCaseParamsSchema),
  validateBody(attachNegotiationShieldDocumentBodySchema),
  attachNegotiationShieldDocumentMetadata
);

router.post(
  '/properties/:propertyId/negotiation-shield/cases/:caseId/documents/:caseDocumentId/parse',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validate(negotiationShieldCaseDocumentParamsSchema),
  parseNegotiationShieldDocument
);

router.post(
  '/properties/:propertyId/negotiation-shield/cases/:caseId/analyze',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validate(negotiationShieldCaseParamsSchema),
  analyzeNegotiationShieldCase
);

export default router;
