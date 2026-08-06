// apps/backend/src/validators/homeEvents.validators.ts
import { z } from 'zod';
import {
  HomeEventDocumentKind,
  HomeEventDatePrecision,
  HomeEventEvidenceType,
  HomeEventImportance,
  HomeEventType,
  HomeEventVisibility,
} from '@prisma/client';

const HomeEventTypeSchema = z.nativeEnum(HomeEventType);
const HomeEventImportanceSchema = z.nativeEnum(HomeEventImportance);
const HomeEventVisibilitySchema = z.nativeEnum(HomeEventVisibility);
const HomeEventDocumentKindSchema = z.nativeEnum(HomeEventDocumentKind);
const HomeEventDatePrecisionSchema = z.nativeEnum(HomeEventDatePrecision);
const HomeEventEvidenceTypeSchema = z.nativeEnum(HomeEventEvidenceType);

export const createHomeEventBodySchema = z.object({
  type: HomeEventTypeSchema,
  subtype: z.string().min(1).max(80).optional().nullable(),
  importance: HomeEventImportanceSchema.optional(),
  visibility: HomeEventVisibilitySchema.optional(),

  occurredAt: z.string().datetime(),
  endAt: z.string().datetime().optional().nullable(),
  datePrecision: HomeEventDatePrecisionSchema.optional(),
  dateRangeStart: z.string().datetime().optional().nullable(),
  dateRangeEnd: z.string().datetime().optional().nullable(),

  title: z.string().min(1).max(140),
  summary: z.string().max(500).optional().nullable(),

  currency: z.string().max(8).optional().nullable(),
  amount: z.number().optional().nullable(),
  valueDelta: z.number().optional().nullable(),

  roomId: z.string().uuid().optional().nullable(),
  inventoryItemId: z.string().uuid().optional().nullable(),
  claimId: z.string().uuid().optional().nullable(),
  expenseId: z.string().uuid().optional().nullable(),

  meta: z.unknown().optional().nullable(),
  groupKey: z.string().max(120).optional().nullable(),
  idempotencyKey: z.string().max(160).optional().nullable(),

  // FRD-FR-03: guidance journey linkage for retrospective history records
  guidanceJourneyId: z.string().uuid().optional().nullable(),
  isRetrospective: z.boolean().optional(),
  parentEventId: z.string().uuid().optional().nullable(),
  groupType: z.string().min(1).max(80).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.datePrecision === HomeEventDatePrecision.RANGE) {
    if (!value.dateRangeStart || !value.dateRangeEnd) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateRangeStart'],
        message: 'RANGE precision requires dateRangeStart and dateRangeEnd.',
      });
    }
  }
});

export const updateHomeEventBodySchema = createHomeEventBodySchema
  .omit({ idempotencyKey: true })
  .partial()
  .extend({
    correctionReason: z.string().trim().min(3).max(500),
  });

export const deleteHomeEventBodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const confirmHomeEventBodySchema = z.object({
  status: z.enum(['HOMEOWNER_CONFIRMED', 'DISPUTED']),
  reason: z.string().trim().min(3).max(500),
});

// RESALE_PACK now has a real downstream consumer (propertyBrief.service
// .ts's assembleSections() requires it exactly for PROSPECTIVE_BUYER/
// LISTING_AGENT briefs — Slice 6's "resale-safe projection policy"), so it's
// exposed here too. SHARE_LINK remains reserved/unexposed: nothing
// downstream distinguishes it from HOUSEHOLD yet, so offering it as a
// choice would imply a distinction that isn't real.
export const setHomeEventVisibilityBodySchema = z.object({
  visibility: z.enum(['PRIVATE', 'HOUSEHOLD', 'RESALE_PACK']),
});

export const addHomeEventEvidenceBodySchema = z.object({
  evidenceType: HomeEventEvidenceTypeSchema,
  documentId: z.string().uuid().optional().nullable(),
  sourceEntityType: z.string().trim().min(1).max(120).optional().nullable(),
  sourceEntityId: z.string().trim().min(1).max(300).optional().nullable(),
  observedAt: z.string().datetime().optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
}).refine(
  (value) => value.documentId || (value.sourceEntityType && value.sourceEntityId)
    || value.evidenceType === HomeEventEvidenceType.USER_ATTESTATION,
  { message: 'Evidence requires a document, a source entity, or user attestation.' },
);

export const exportHomeEventsBodySchema = z.object({
  eventIds: z.array(z.string().uuid()).min(1).max(200),
});

export const attachHomeEventDocumentBodySchema = z.object({
  documentId: z.string().uuid(),
  kind: HomeEventDocumentKindSchema.optional(),
  caption: z.string().max(160).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const listHomeEventsQuerySchema = z.object({
  type: HomeEventTypeSchema.optional(),
  importance: HomeEventImportanceSchema.optional(),
  roomId: z.string().uuid().optional(),
  inventoryItemId: z.string().uuid().optional(),
  claimId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  includeSignals: z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
  ]).optional(),
}).superRefine((query, ctx) => {
  if (!query.from || !query.to) return;

  const from = Date.parse(query.from);
  const to = Date.parse(query.to);
  if (!Number.isNaN(from) && !Number.isNaN(to) && from > to) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['from'],
      message: '"from" must be less than or equal to "to"',
    });
  }
});
