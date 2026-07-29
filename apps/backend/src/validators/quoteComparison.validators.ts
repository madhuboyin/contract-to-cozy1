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
});

export const updateQuoteProposalSchema = createQuoteProposalSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one proposal field must be provided.' },
);

export const createQuoteFromDocumentSchema = z.object({
  documentId: z.string().uuid(),
});
