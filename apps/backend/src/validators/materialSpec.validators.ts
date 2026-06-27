import { z } from 'zod';
import { MaterialCategory, MaterialScopeLevel, MaterialSurface } from '@prisma/client';

const categorySchema = z.nativeEnum(MaterialCategory);
const scopeLevelSchema = z.nativeEnum(MaterialScopeLevel);
const surfaceSchema = z.nativeEnum(MaterialSurface);

export const createSpecBodySchema = z.object({
  scopeLevel: scopeLevelSchema,
  category: categorySchema,
  surface: surfaceSchema.optional().nullable(),
  label: z.string().min(1).max(200),
  roomId: z.string().uuid().optional().nullable(),

  manufacturer: z.string().max(100).optional().nullable(),
  productLine: z.string().max(100).optional().nullable(),
  productName: z.string().max(200).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  colorCode: z.string().max(50).optional().nullable(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  finish: z.string().max(80).optional().nullable(),
  dimensions: z.string().max(100).optional().nullable(),
  material: z.string().max(100).optional().nullable(),
  supplier: z.string().max(150).optional().nullable(),
  supplierUrl: z.string().url().max(500).optional().nullable(),
  purchaseDate: z.string().datetime().optional().nullable(),
  quantityPurchased: z.string().max(80).optional().nullable(),
  lotBatch: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),

  linkedInventoryItemId: z.string().uuid().optional().nullable(),
  linkedHomeAssetId: z.string().uuid().optional().nullable(),
});

export const updateSpecBodySchema = createSpecBodySchema.partial();

export const listSpecsQuerySchema = z.object({
  category: categorySchema.optional(),
  scopeLevel: scopeLevelSchema.optional(),
  roomId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export const searchSpecsQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export const addPhotoBodySchema = z.object({
  photoUrl: z.string().url().max(1000),
  fileKey: z.string().min(1).max(500),
  caption: z.string().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const reorderPhotosBodySchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(50),
});

export const requestExportBodySchema = z.object({
  scopeType: z.enum(['ALL', 'ROOM', 'CATEGORY']),
  title: z.string().min(1).max(200),
  roomId: z.string().uuid().optional().nullable(),
  category: categorySchema.optional().nullable(),
});
