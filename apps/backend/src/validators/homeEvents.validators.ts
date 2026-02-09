// apps/backend/src/validators/homeEvents.validators.ts
import { z } from 'zod';
import {
  HomeEventDocumentKind,
  HomeEventImportance,
  HomeEventType,
  HomeEventVisibility,
} from '@prisma/client';

const HomeEventTypeSchema = z.nativeEnum(HomeEventType);
const HomeEventImportanceSchema = z.nativeEnum(HomeEventImportance);
const HomeEventVisibilitySchema = z.nativeEnum(HomeEventVisibility);
const HomeEventDocumentKindSchema = z.nativeEnum(HomeEventDocumentKind);

export const createHomeEventBodySchema = z.object({
  type: HomeEventTypeSchema,
  subtype: z.string().min(1).max(80).optional().nullable(),
  importance: HomeEventImportanceSchema.optional(),
  visibility: HomeEventVisibilitySchema.optional(),

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
});
