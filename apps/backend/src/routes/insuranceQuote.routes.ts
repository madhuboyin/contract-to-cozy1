// apps/backend/src/routes/insuranceQuote.routes.ts
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { CustomRequest } from '../types';
import { UserRole } from '../types/auth.types';
import {
  createInsuranceHandoffRequest,
  getInsuranceHandoffReadiness,
  getInsuranceHandoffRequest,
  ingestReturnedInsuranceQuote,
  withdrawInsuranceHandoffRequest,
} from '../services/insuranceHandoff.service';
import { getCoverageOperationsHealth } from '../services/coverageLifecycle.service';
import { getCoverageLaunchGate } from '../services/coverageLaunchGate.service';

export const insuranceQuoteRouter = Router();

insuranceQuoteRouter.get(
  '/admin/coverage-operations/health',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('RELEASE_GATE_VIEW'),
  handler(async (_req, res) => {
    const health = await getCoverageOperationsHealth();
    res.json({ success: true, data: health });
  })
);

insuranceQuoteRouter.get(
  '/admin/coverage-operations/launch-gate',
  authenticate,
  requireMfa,
  requireRole(UserRole.ADMIN),
  requireCapability('RELEASE_GATE_VIEW'),
  handler(async (_req, res) => {
    const gate = await getCoverageLaunchGate();
    res.json({ success: true, data: gate });
  })
);

const consentSchema = z.object({
  dataSharing: z.literal(true),
  disclosuresAccepted: z.literal(true),
  email: z.boolean(),
  sms: z.boolean(),
  phone: z.boolean(),
});

const requestSchema = z.object({
  requestId: z.string().uuid(),
  recipientId: z.string().uuid(),
  disclosureVersion: z.string().trim().min(1).max(120),
  source: z.enum(['COVERAGE_REVIEW', 'COVERAGE_COMPARISON', 'MANUAL']),
  purpose: z.string().trim().min(1).max(500),
  preferredContact: z.enum(['EMAIL', 'SMS', 'PHONE']),
  contactEmail: z.string().email().max(320).nullable().optional(),
  contactPhone: z.string().trim().min(7).max(40).nullable().optional(),
  coverageComparisonId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  consent: consentSchema,
});

const factSchema = z.object({
  factKey: z.string().trim().min(1).max(100),
  valueType: z.enum(['AMOUNT', 'TEXT', 'BOOLEAN', 'JSON']),
  amountValue: z.number().nonnegative().nullable().optional(),
  textValue: z.string().trim().max(500).nullable().optional(),
  booleanValue: z.boolean().nullable().optional(),
  jsonValue: z.unknown().optional(),
  currency: z.string().trim().length(3).nullable().optional(),
  confirmationStatus: z.enum(['CONFIRMED', 'PENDING']),
  sourcePage: z.number().int().positive().nullable().optional(),
});

const returnedQuoteSchema = z.object({
  comparisonId: z.string().uuid().nullable().optional(),
  optionType: z.literal('QUOTE_DOCUMENT').optional(),
  label: z.string().trim().min(1).max(120),
  sourceDocumentId: z.string().uuid(),
  carrierName: z.string().trim().max(160).nullable().optional(),
  facts: z.array(factSchema).max(50),
});

function handler(
  fn: (req: CustomRequest, res: Response) => Promise<unknown>
) {
  return (req: CustomRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

insuranceQuoteRouter.get(
  '/properties/:propertyId/insurance-handoff/readiness',
  authenticate,
  propertyAuthMiddleware,
  handler(async (req, res) => {
    const readiness = await getInsuranceHandoffReadiness(req.params.propertyId, req.user!.userId);
    res.json({ success: true, data: readiness });
  })
);

insuranceQuoteRouter.post(
  '/properties/:propertyId/insurance-handoff/requests',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(requestSchema),
  handler(async (req, res) => {
    const request = await createInsuranceHandoffRequest(
      req.params.propertyId,
      req.user!.userId,
      req.body
    );
    res.status(request.idempotentReplay ? 200 : 201).json({
      success: true,
      data: { request },
    });
  })
);

insuranceQuoteRouter.get(
  '/properties/:propertyId/insurance-handoff/requests/:requestId',
  authenticate,
  propertyAuthMiddleware,
  handler(async (req, res) => {
    const request = await getInsuranceHandoffRequest(
      req.params.propertyId,
      req.params.requestId,
      req.user!.userId
    );
    res.json({ success: true, data: { request } });
  })
);

insuranceQuoteRouter.post(
  '/properties/:propertyId/insurance-handoff/requests/:requestId/withdraw',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  handler(async (req, res) => {
    const request = await withdrawInsuranceHandoffRequest(
      req.params.propertyId,
      req.params.requestId,
      req.user!.userId
    );
    res.json({ success: true, data: { request } });
  })
);

insuranceQuoteRouter.post(
  '/properties/:propertyId/insurance-handoff/requests/:requestId/returned-quote',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(returnedQuoteSchema),
  handler(async (req, res) => {
    const result = await ingestReturnedInsuranceQuote(
      req.params.propertyId,
      req.params.requestId,
      req.user!.userId,
      req.body
    );
    res.json({ success: true, data: result });
  })
);
