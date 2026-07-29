import { z } from 'zod';
import {
  MaterialCategory,
  MaterialComplianceCheckStatus,
  MaterialLifecycleStatus,
  MaterialScopeLevel,
  MaterialSurface,
} from '@prisma/client';

const categorySchema = z.nativeEnum(MaterialCategory);
const scopeLevelSchema = z.nativeEnum(MaterialScopeLevel);
const surfaceSchema = z.nativeEnum(MaterialSurface);
const lifecycleStatusSchema = z.nativeEnum(MaterialLifecycleStatus);
const complianceCheckSchema = z.nativeEnum(MaterialComplianceCheckStatus);
const jsonObjectSchema = z.record(z.string(), z.unknown());

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
  projectId: z.string().uuid().optional().nullable(),
  scopeVersionId: z.string().uuid().optional().nullable(),
  careInstructions: z.string().max(5000).optional().nullable(),
  complianceRelevance: z.object({
    permitRelevant: z.boolean().default(false),
    hoaRelevant: z.boolean().default(false),
    attributes: z.array(z.string().min(1).max(100)).max(50).default([]),
  }).optional().nullable(),
  permitAttributeCheck: complianceCheckSchema.optional(),
  hoaAttributeCheck: complianceCheckSchema.optional(),
  submittalDocumentIds: z.array(z.string().uuid()).max(50).optional(),
});

export const updateSpecBodySchema = createSpecBodySchema.partial();

export const listSpecsQuerySchema = z.object({
  category: categorySchema.optional(),
  scopeLevel: scopeLevelSchema.optional(),
  roomId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  lifecycleStatus: lifecycleStatusSchema.optional(),
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

export const transitionMaterialLifecycleBodySchema = z.object({
  toStatus: z.enum(['APPROVED', 'INSTALLED', 'AS_BUILT']),
  evidenceDocumentIds: z.array(z.string().uuid()).max(50).default([]),
  notes: z.string().trim().min(1).max(3000),
  approvalDocumentIds: z.array(z.string().uuid()).max(50).optional(),
  submittalDocumentIds: z.array(z.string().uuid()).max(50).optional(),
  receiptDocumentId: z.string().uuid().optional().nullable(),
  warrantyDocumentId: z.string().uuid().optional().nullable(),
  manualDocumentId: z.string().uuid().optional().nullable(),
  quantityInstalled: z.string().trim().min(1).max(100).optional().nullable(),
  quantityRemaining: z.string().trim().max(100).optional().nullable(),
  remainingStorageLocation: z.string().trim().max(300).optional().nullable(),
  installedByName: z.string().trim().max(200).optional().nullable(),
  installedAt: z.string().datetime().optional().nullable(),
  permitAttributeCheck: complianceCheckSchema.optional(),
  hoaAttributeCheck: complianceCheckSchema.optional(),
});

export const substituteMaterialBodySchema = z.object({
  replacement: createSpecBodySchema.pick({
    label: true,
    category: true,
    scopeLevel: true,
    surface: true,
    roomId: true,
    manufacturer: true,
    productLine: true,
    productName: true,
    sku: true,
    colorCode: true,
    colorHex: true,
    finish: true,
    dimensions: true,
    material: true,
    supplier: true,
    supplierUrl: true,
    quantityPurchased: true,
    lotBatch: true,
    notes: true,
  }).partial().extend({
    label: z.string().min(1).max(200),
  }),
  comparison: z.object({
    identityChanges: z.array(z.string().min(1).max(200)).min(1).max(50),
    costDeltaCents: z.number().int().optional(),
    scheduleImpact: z.string().max(1000).optional(),
    reason: z.string().trim().min(1).max(2000),
  }),
  complianceImpact: z.object({
    permitRelevant: z.boolean(),
    hoaRelevant: z.boolean(),
    changedAttributes: z.array(z.string().min(1).max(100)).max(50),
    explanation: z.string().trim().min(1).max(2000),
  }),
  evidenceDocumentIds: z.array(z.string().uuid()).min(1).max(50),
  sourceChangeOrderId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().min(1).max(3000),
});

export const createMaterialExtractionBodySchema = z.object({
  sourceDocumentId: z.string().uuid().optional().nullable(),
  sourcePhotoKey: z.string().min(1).max(500).optional().nullable(),
  extractionMethod: z.string().trim().min(1).max(100),
  parserVersion: z.string().max(100).optional().nullable(),
  candidateFields: jsonObjectSchema,
  confidence: jsonObjectSchema.optional().nullable(),
}).refine(value => Boolean(value.sourceDocumentId || value.sourcePhotoKey), {
  message: 'A source document or photo is required.',
  path: ['sourceDocumentId'],
});

export const reviewMaterialExtractionBodySchema = z.object({
  status: z.enum(['CONFIRMED', 'REJECTED']),
  reviewedFields: jsonObjectSchema.optional(),
  reviewNotes: z.string().trim().min(1).max(3000),
});
