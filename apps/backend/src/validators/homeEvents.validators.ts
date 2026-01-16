// apps/backend/src/validators/homeEvents.validators.ts
import { z } from 'zod';

const HomeEventType = z.enum([
  'PURCHASE',
  'REPAIR',
  'MAINTENANCE',
  'CLAIM',
  'IMPROVEMENT',
  'VALUE_UPDATE',
  'INSPECTION',
  'NOTE',
  'MILESTONE',
  'OTHER',
]);

const HomeEventImportance = z.enum(['LOW', 'NORMAL', 'HIGH', 'HIGHLIGHT']);
const HomeEventVisibility = z.enum(['PRIVATE', 'HOUSEHOLD', 'SHARE_LINK', 'RESALE_PACK']);
const HomeEventDocumentKind = z.enum(['PHOTO', 'RECEIPT', 'INVOICE', 'PDF', 'BEFORE', 'AFTER', 'OTHER']);

export const createHomeEventBodySchema = z.object({
  type: HomeEventType,
  subtype: z.string().min(1).max(80).optional().nullable(),
  importance: HomeEventImportance.optional(),
  visibility: HomeEventVisibility.optional(),

  occurredAt: z.string().datetime(),
  endAt: z.string().datetime().optional().nullable(),

  title: z.string().min(1).max(140),
  summary: z.string().max(500).optional().nullable(),

  currency: z.string().max(8).optional().nullable(),
  amount: z.number().optional().nullable(),
  valueDelta: z.number().optional().nullable(),

  roomId: z.string().uuid().optional().nullable(),
  inventoryItemId: z.string().uuid().optional().nullable(),
  claimId: z.string().uuid().optional().nullable(),
  expenseId: z.string().uuid().optional().nullable(),

  meta: z.any().optional().nullable(),
  groupKey: z.string().max(120).optional().nullable(),
  idempotencyKey: z.string().max(160).optional().nullable(),
});

export const updateHomeEventBodySchema = createHomeEventBodySchema.partial();

export const attachHomeEventDocumentBodySchema = z.object({
  documentId: z.string().uuid(),
  kind: HomeEventDocumentKind.optional(),
  caption: z.string().max(160).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const listHomeEventsQuerySchema = z.object({
  type: HomeEventType.optional(),
  importance: HomeEventImportance.optional(),
  roomId: z.string().uuid().optional(),
  inventoryItemId: z.string().uuid().optional(),
  claimId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
