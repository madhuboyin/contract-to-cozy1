import { z } from 'zod';
import {
  SERVICE_RADAR_CATEGORY_VALUES,
  SERVICE_RADAR_LINKED_ENTITY_TYPE_VALUES,
  SERVICE_RADAR_QUOTE_SOURCE_VALUES,
} from '../services/servicePriceRadar.types';

const MAX_SERVICE_PRICE_RADAR_QUOTE_AMOUNT = 250000;

function normalizeLooseToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function enumValueSchema<const TValues extends readonly string[]>(values: TValues, label: string) {
  return z
    .string()
    .trim()
    .min(1)
    .transform((value) => normalizeLooseToken(value))
    .refine((value) => (values as readonly string[]).includes(value), {
      message: `Invalid ${label}`,
    })
    .transform((value) => value as TValues[number]);
}

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    });

const positiveAmountSchema = z.union([z.number(), z.string().trim()]).transform((value, ctx) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'quoteAmount must be greater than 0',
    });
    return z.NEVER;
  }
  if (numeric > MAX_SERVICE_PRICE_RADAR_QUOTE_AMOUNT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `quoteAmount must be less than or equal to ${MAX_SERVICE_PRICE_RADAR_QUOTE_AMOUNT}`,
    });
    return z.NEVER;
  }
  return Math.round(numeric * 100) / 100;
});

export const createServicePriceRadarBodySchema = z.object({
  serviceCategory: enumValueSchema(SERVICE_RADAR_CATEGORY_VALUES, 'serviceCategory'),
  serviceSubcategory: optionalTrimmedString(120),
  serviceLabelRaw: optionalTrimmedString(200),
  quoteAmount: positiveAmountSchema,
  quoteCurrency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/, 'quoteCurrency must be a 3-letter currency code')
    .optional()
    .transform((value) => value?.toUpperCase()),
  quoteVendorName: optionalTrimmedString(120),
  quoteSource: enumValueSchema(SERVICE_RADAR_QUOTE_SOURCE_VALUES, 'quoteSource').optional(),
  linkedEntities: z
    .array(
      z.object({
        linkedEntityType: enumValueSchema(
          SERVICE_RADAR_LINKED_ENTITY_TYPE_VALUES,
          'linkedEntityType'
        ),
        linkedEntityId: z.string().trim().min(1).max(191),
        relevanceScore: z.number().min(0).max(1).optional(),
      })
    )
    .max(10)
    .optional(),
});

export type CreateServicePriceRadarBody = z.infer<typeof createServicePriceRadarBodySchema>;

export const listServicePriceRadarQuerySchema = z.object({
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

export type ListServicePriceRadarQuery = z.infer<typeof listServicePriceRadarQuerySchema>;

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const trackServicePriceRadarEventBodySchema = z.object({
  event: z.string().trim().min(1).max(80),
  section: z.string().trim().min(1).max(80).optional(),
  metadata: jsonObjectSchema.optional(),
});

export type TrackServicePriceRadarEventBody = z.infer<typeof trackServicePriceRadarEventBodySchema>;
