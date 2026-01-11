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