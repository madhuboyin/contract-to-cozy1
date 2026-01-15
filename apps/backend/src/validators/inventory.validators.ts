// apps/backend/src/validators/inventory.validators.ts
import { z } from 'zod';
import { InventoryItemCategory, InventoryItemCondition } from '@prisma/client';


// ---- Rooms ----
export const createRoomBodySchema = z.object({
  name: z.string().min(1).max(80),
  floorLevel: z.number().int().min(-5).max(50).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const updateRoomBodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  floorLevel: z.number().int().min(-5).max(50).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),

  // ✅ NEW: questionnaire payload (flexible)
  profile: z.record(z.string(), z.any()).optional().nullable(),
});

const jsonValue: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ])
);

export const updateRoomProfileBodySchema = z.object({
  profile: z.unknown().nullable(), // stored as JSONB (required key)
});

// ---- Items ----
const optionalTrimmed = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .nullable()
    .optional();

export const createItemBodySchema = z.object({
  name: z.string().min(1).max(120),
  category: z.nativeEnum(InventoryItemCategory),
  condition: z.nativeEnum(InventoryItemCondition).optional(),

  roomId: z.string().uuid().nullable().optional(),
  homeAssetId: z.string().uuid().nullable().optional(),
  warrantyId: z.string().uuid().nullable().optional(),
  insurancePolicyId: z.string().uuid().nullable().optional(),

  brand: optionalTrimmed(80),
  model: optionalTrimmed(80),
  serialNo: optionalTrimmed(120),

  // ✅ Recall / barcode fields (already exist in Prisma schema)
  manufacturer: z.string().trim().max(255).optional().nullable(),
  modelNumber: z.string().trim().max(255).optional().nullable(),
  serialNumber: z.string().trim().max(255).optional().nullable(),
  upc: z.string().trim().max(64).optional().nullable(),
  sku: z.string().trim().max(64).optional().nullable(),
  

  installedOn: z.string().datetime().nullable().optional(),
  purchasedOn: z.string().datetime().nullable().optional(),
  lastServicedOn: z.string().datetime().nullable().optional(),

  purchaseCostCents: z.number().int().min(0).nullable().optional(),
  replacementCostCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().min(3).max(3).optional().default('USD'),

  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(40)).optional().default([]),
});

export const updateItemBodySchema = createItemBodySchema.partial();

export const linkDocumentBodySchema = z.object({
  documentId: z.string().uuid(),
});

export const createRoomChecklistItemBodySchema = z.object({
  title: z.string().min(1).max(140),
  notes: z.string().max(1000).optional().nullable(),
  frequency: z.enum(['ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEASONAL']).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  nextDueDate: z.string().datetime().optional().nullable(),

  // optional stable key
  key: z.string().max(120).optional().nullable(),
});

export const updateRoomChecklistItemBodySchema = z.object({
  title: z.string().min(1).max(140).optional(),
  notes: z.string().max(1000).optional().nullable(),
  frequency: z.enum(['ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEASONAL']).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  status: z.enum(['OPEN', 'DONE']).optional(),
  nextDueDate: z.string().datetime().optional().nullable(),
});
