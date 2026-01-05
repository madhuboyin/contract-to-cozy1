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
export const createItemBodySchema = z.object({
  name: z.string().min(1).max(120),
  category: z.nativeEnum(InventoryItemCategory),
  condition: z.nativeEnum(InventoryItemCondition).optional(),

  roomId: z.string().uuid().nullable().optional(),
  homeAssetId: z.string().uuid().nullable().optional(),
  warrantyId: z.string().uuid().nullable().optional(),
  insurancePolicyId: z.string().uuid().nullable().optional(),

  brand: z.string().max(80).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  serialNo: z.string().max(120).nullable().optional(),

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

// ---- Document linking ----
export const linkDocumentBodySchema = z.object({
  documentId: z.string().uuid(),
});
