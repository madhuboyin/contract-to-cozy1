import { ServiceCategory } from '@prisma/client';
import { z } from 'zod';

export const getOrCreateQuoteWorkspaceSchema = z.object({
  serviceCategory: z.nativeEnum(ServiceCategory).optional().nullable(),
  inventoryItemId: z.string().uuid().optional().nullable(),
  guidanceJourneyId: z.string().uuid().optional().nullable(),
  guidanceStepKey: z.string().max(200).optional().nullable(),
  guidanceSignalIntentFamily: z.string().max(200).optional().nullable(),
  scopeSummary: z.string().max(1000).optional().nullable(),
}).refine(
  (value) => Boolean(
    value.serviceCategory ||
    value.inventoryItemId ||
    value.guidanceJourneyId
  ),
  { message: 'A service category, linked item/asset, or guidance journey is required.' },
);

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const nullableNumber = z.number().finite().optional().nullable();

export const quoteLineItemSchema = z.object({
  kind: z.enum(['LABOR', 'MATERIAL', 'EQUIPMENT', 'PERMIT', 'DISPOSAL', 'TAX', 'ALLOWANCE', 'OTHER']).optional(),
  description: z.string().trim().min(1).max(1000),
  quantity: nullableNumber,
  unit: nullableText(80),
  unitPrice: z.number().nonnegative().finite().optional().nullable(),
  total: z.number().nonnegative().finite().optional().nullable(),
});

export const quoteTermSchema = z.object({
  type: z.enum([
    'INCLUSION', 'EXCLUSION', 'ALLOWANCE', 'PERMIT', 'DISPOSAL', 'CLEANUP',
    'WARRANTY', 'PAYMENT', 'SCHEDULE', 'EXPIRATION', 'LICENSE', 'INSURANCE',
    'CHANGE_ORDER', 'OTHER',
  ]),
  label: nullableText(200),
  value: z.string().trim().min(1).max(4000),
  included: z.boolean().optional().nullable(),
});

export const createQuoteProposalSchema = z.object({
  vendorName: z.string().trim().min(1).max(300),
  quoteAmount: z.number().nonnegative().finite(),
  currency: z.string().trim().length(3).optional(),
  quoteDate: z.string().datetime().optional().nullable(),
  expirationDate: z.string().datetime().optional().nullable(),
  serviceLabelRaw: nullableText(300),
  serviceCategory: z.nativeEnum(ServiceCategory).optional().nullable(),
  serviceLocation: nullableText(300),
  scopeKind: z.enum(['REPAIR', 'REPLACEMENT', 'INSTALLATION', 'MAINTENANCE', 'INSPECTION', 'OTHER', 'UNKNOWN']).optional().nullable(),
  scopeSummary: nullableText(4000),
  notes: nullableText(4000),
  sourceType: z.enum(['MANUAL', 'PASTED_TEXT', 'UPLOADED_QUOTE', 'SYSTEM_LINKED']).optional(),
  sourceReferenceId: nullableText(300),
  providerLicenseNumber: nullableText(200),
  providerLicenseVerified: z.boolean().optional().nullable(),
  providerInsuranceVerified: z.boolean().optional().nullable(),
  lineItems: z.array(quoteLineItemSchema).max(200).optional(),
  terms: z.array(quoteTermSchema).max(100).optional(),
}).refine(
  (value) => value.sourceType !== 'SYSTEM_LINKED' || Boolean(value.sourceReferenceId),
  { message: 'sourceReferenceId is required for a system-linked quote.', path: ['sourceReferenceId'] },
);

export const updateQuoteProposalSchema = z.object({
  vendorName: z.string().trim().min(1).max(300),
  quoteAmount: z.number().nonnegative().finite(),
  currency: z.string().trim().length(3),
  quoteDate: z.string().datetime().nullable(),
  expirationDate: z.string().datetime().nullable(),
  serviceLabelRaw: z.string().trim().max(300).nullable(),
  serviceCategory: z.nativeEnum(ServiceCategory).nullable(),
  serviceLocation: z.string().trim().max(300).nullable(),
  scopeKind: z.enum(['REPAIR', 'REPLACEMENT', 'INSTALLATION', 'MAINTENANCE', 'INSPECTION', 'OTHER', 'UNKNOWN']).nullable(),
  scopeSummary: z.string().trim().max(4000).nullable(),
  notes: z.string().trim().max(4000).nullable(),
  sourceType: z.enum(['MANUAL', 'PASTED_TEXT', 'UPLOADED_QUOTE', 'SYSTEM_LINKED']),
  sourceReferenceId: z.string().trim().max(300).nullable(),
  providerLicenseNumber: z.string().trim().max(200).nullable(),
  providerLicenseVerified: z.boolean().nullable(),
  providerInsuranceVerified: z.boolean().nullable(),
  lineItems: z.array(quoteLineItemSchema).max(200),
  terms: z.array(quoteTermSchema).max(100),
}).partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one proposal field must be provided.' },
);

export const createQuoteFromDocumentSchema = z.object({
  documentId: z.string().uuid(),
});

export const selectQuoteSchema = z.object({
  quoteId: z.string().uuid(),
});

export const transitionQuoteDecisionSchema = z.object({
  toStage: z.literal('CLOSED'),
  outcome: z.enum(['DECLINED', 'DEFERRED']),
  reason: nullableText(1000),
  relatedEntityType: z.enum([
    'INVENTORY_ITEM', 'DOCUMENT', 'INCIDENT', 'SERVICE_RADAR_CHECK',
    'GUIDANCE_JOURNEY', 'NEGOTIATION_CASE', 'PRICE_FINALIZATION',
    'BOOKING', 'PROJECT', 'OTHER',
  ]).optional().nullable(),
  relatedEntityId: z.string().max(300).optional().nullable(),
}).refine(
  (value) => Boolean(value.relatedEntityType) === Boolean(value.relatedEntityId),
  { message: 'relatedEntityType and relatedEntityId must be provided together.' },
);

export const quoteDecisionContextLinkSchema = z.object({
  entityType: z.enum([
    'INVENTORY_ITEM', 'DOCUMENT', 'INCIDENT', 'SERVICE_RADAR_CHECK',
    'GUIDANCE_JOURNEY', 'NEGOTIATION_CASE', 'PRICE_FINALIZATION',
    'BOOKING', 'PROJECT', 'OTHER',
  ]),
  entityId: z.string().min(1).max(300),
  label: nullableText(300),
  metadataJson: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const quoteDispositionSchema = z.object({
  decision: z.enum(['REJECTED', 'UNDECIDED']),
});

export const createQuoteClarificationSchema = z.object({
  question: z.string().trim().min(3).max(2000),
});

export const resolveQuoteClarificationSchema = z.object({
  response: z.string().trim().min(1).max(4000),
});

export const serviceQuoteOutcomeConsentSchema = z.object({
  consented: z.boolean(),
  finalPrice: z.boolean().default(false),
  changeOrders: z.boolean().default(false),
  policyVersion: z.literal('service-quote-outcomes-v1'),
}).superRefine((value, ctx) => {
  if (value.consented && !value.finalPrice && !value.changeOrders) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Select at least one outcome data type when granting consent.',
    });
  }
  if (!value.consented && (value.finalPrice || value.changeOrders)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Outcome data types must be false when revoking consent.',
    });
  }
});
