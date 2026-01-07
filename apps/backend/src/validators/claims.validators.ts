// apps/backend/src/validators/claims.validators.ts
import { z } from 'zod';

export const ClaimTypeSchema = z.enum([
  'WATER_DAMAGE',
  'FIRE_SMOKE',
  'STORM_WIND_HAIL',
  'THEFT_VANDALISM',
  'LIABILITY',
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'APPLIANCE',
  'OTHER',
]);

export const ClaimSourceTypeSchema = z.enum([
  'INSURANCE',
  'HOME_WARRANTY',
  'MANUFACTURER_WARRANTY',
  'OUT_OF_POCKET',
  'UNKNOWN',
]);

export const ClaimStatusSchema = z.enum([
  'DRAFT',
  'IN_PROGRESS',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'DENIED',
  'CLOSED',
]);

export const ClaimChecklistStatusSchema = z.enum(['OPEN', 'DONE', 'NOT_APPLICABLE']);

export const ClaimDocumentTypeSchema = z.enum([
  'PHOTO',
  'VIDEO',
  'INVOICE',
  'ESTIMATE',
  'REPORT',
  'POLICY',
  'COMMUNICATION',
  'RECEIPT',
  'OTHER',
]);

export const ClaimTimelineEventTypeSchema = z.enum([
  'CREATED',
  'CHECKLIST_GENERATED',
  'DOCUMENT_ADDED',
  'SUBMITTED',
  'INSPECTION_SCHEDULED',
  'INSPECTION_COMPLETED',
  'ESTIMATE_RECEIVED',
  'FOLLOW_UP',
  'APPROVED',
  'DENIED',
  'SETTLEMENT_ISSUED',
  'CLOSED',
  'NOTE',
  'OTHER',
]);

const IsoDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime()) // allow no offset if your clients send it
  .optional()
  .nullable();

const DecimalStringSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string (up to 2 decimals)')
  .optional()
  .nullable();

export const CreateClaimSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  type: ClaimTypeSchema,

  sourceType: ClaimSourceTypeSchema.optional(),
  providerName: z.string().optional().nullable(),
  claimNumber: z.string().optional().nullable(),
  externalUrl: z.string().url().optional().nullable(),

  insurancePolicyId: z.string().uuid().optional().nullable(),
  warrantyId: z.string().uuid().optional().nullable(),

  incidentAt: IsoDateSchema,
  generateChecklist: z.boolean().optional(),
});

export const UpdateClaimSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  status: ClaimStatusSchema.optional(),

  sourceType: ClaimSourceTypeSchema.optional(),
  providerName: z.string().optional().nullable(),
  claimNumber: z.string().optional().nullable(),
  externalUrl: z.string().url().optional().nullable(),

  insurancePolicyId: z.string().uuid().optional().nullable(),
  warrantyId: z.string().uuid().optional().nullable(),

  incidentAt: IsoDateSchema,
  openedAt: IsoDateSchema,
  submittedAt: IsoDateSchema,
  closedAt: IsoDateSchema,

  deductibleAmount: DecimalStringSchema,
  estimatedLossAmount: DecimalStringSchema,
  settlementAmount: DecimalStringSchema,

  nextFollowUpAt: IsoDateSchema,
});

export const AddClaimDocumentSchema = z.object({
  // Document model fields
  type: z.string().min(1), // your DocumentType enum string (keep loose)
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  fileUrl: z.string().url(),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1),
  metadata: z.any().optional(),

  // claim-specific metadata
  claimDocumentType: ClaimDocumentTypeSchema.optional(),
  title: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),

  attachToPolicy: z.boolean().optional(),
  attachToWarranty: z.boolean().optional(),
});

export const AddTimelineEventSchema = z.object({
  type: ClaimTimelineEventTypeSchema,
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  occurredAt: IsoDateSchema,
  meta: z.any().optional(),
  claimDocumentId: z.string().uuid().optional().nullable(),
});

export const UpdateChecklistItemSchema = z.object({
  status: ClaimChecklistStatusSchema,
  primaryClaimDocumentId: z.string().uuid().optional().nullable(),
});

export const RegenerateChecklistSchema = z.object({
  // If provided, we also update claim.type before regeneration
  type: ClaimTypeSchema.optional(),
  // If true: delete existing checklist items first
  replaceExisting: z.boolean().default(true),
});
