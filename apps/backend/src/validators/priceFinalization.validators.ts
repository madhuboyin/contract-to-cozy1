import { ServiceCategory } from '@prisma/client';
import { z } from 'zod';
import {
  PRICE_FINALIZATION_SOURCE_TYPES,
  PRICE_FINALIZATION_TERM_TYPES,
} from '../services/priceFinalization.types';

const uuidSchema = z.string().uuid();
const jsonRecordSchema = z.record(z.string(), z.unknown());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    });

const optionalCurrency = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter currency code')
  .optional()
  .transform((value) => value?.toUpperCase());

const optionalAmount = z
  .union([z.number(), z.string().trim()])
  .optional()
  .nullable()
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === '') return undefined;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount must be a valid non-negative number',
      });
      return z.NEVER;
    }
    return Math.round(numeric * 100) / 100;
  });

const optionalPositiveAmount = z
  .union([z.number(), z.string().trim()])
  .optional()
  .nullable()
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === '') return undefined;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Accepted price must be greater than 0',
      });
      return z.NEVER;
    }
    return Math.round(numeric * 100) / 100;
  });

const termSchema = z.object({
  termType: z.enum(PRICE_FINALIZATION_TERM_TYPES),
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(2000),
  sortOrder: z.number().int().min(0).optional(),
  isAccepted: z.boolean().optional(),
});

export const priceFinalizationListQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return 20;
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return 20;
      return Math.min(parsed, 50);
    }),
});

export const priceFinalizationPropertyParamsSchema = z.object({
  params: z.object({
    propertyId: uuidSchema,
  }),
});

export const priceFinalizationDetailParamsSchema = z.object({
  params: z.object({
    propertyId: uuidSchema,
    finalizationId: uuidSchema,
  }),
});

export const createPriceFinalizationBodySchema = z.object({
  inventoryItemId: uuidSchema.optional().nullable(),
  homeAssetId: uuidSchema.optional().nullable(),
  guidanceJourneyId: uuidSchema.optional().nullable(),
  guidanceStepKey: z.string().trim().min(1).max(80).optional().nullable(),
  guidanceSignalIntentFamily: z.string().trim().min(1).max(120).optional().nullable(),

  sourceType: z.enum(PRICE_FINALIZATION_SOURCE_TYPES).optional(),

  serviceCategory: z.nativeEnum(ServiceCategory).optional().nullable(),
  vendorName: optionalText(160),
  acceptedPrice: optionalAmount,
  quotePrice: optionalAmount,
  currency: optionalCurrency,

  scopeSummary: optionalText(2000),
  paymentTerms: optionalText(2000),
  warrantyTerms: optionalText(2000),
  timelineTerms: optionalText(2000),
  notes: optionalText(4000),

  acceptedTermsJson: jsonRecordSchema.optional().nullable(),
  metadataJson: jsonRecordSchema.optional().nullable(),

  negotiationShieldCaseId: uuidSchema.optional().nullable(),
  serviceRadarCheckId: uuidSchema.optional().nullable(),
  quoteComparisonWorkspaceId: uuidSchema.optional().nullable(),

  terms: z.array(termSchema).max(20).optional(),
});

export const updatePriceFinalizationBodySchema = createPriceFinalizationBodySchema.extend({
  allowPostFinalizeEdits: z.boolean().optional(),
});

export const finalizePriceFinalizationBodySchema = updatePriceFinalizationBodySchema
  .extend({
    acceptedPrice: optionalPositiveAmount,
  })
  .optional()
  .transform((value) => value ?? {});

export type PriceFinalizationListQuery = z.infer<typeof priceFinalizationListQuerySchema>;
export type CreatePriceFinalizationBody = z.infer<typeof createPriceFinalizationBodySchema>;
export type UpdatePriceFinalizationBody = z.infer<typeof updatePriceFinalizationBodySchema>;
export type FinalizePriceFinalizationBody = z.infer<typeof finalizePriceFinalizationBodySchema>;
