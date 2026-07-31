import { z } from 'zod';

export const propertyChangeTypeSchema = z.enum([
  'SOURCE_RECORD_CREATED',
  'SOURCE_RECORD_REVISED',
  'SOURCE_LIFECYCLE_CHANGED',
  'PROPERTY_FACT_CHANGED',
  'ACTION_STATE_CHANGED',
  'OUTCOME_CONFIRMED',
  'SOURCE_HEALTH_CHANGED',
]);

export const propertyChangeSourceHealthSchema = z.enum([
  'CURRENT',
  'DEGRADED',
  'STALE',
  'UNAVAILABLE',
  'NOT_CONFIGURED',
]);

export const propertyChangeSignalsSchema = z.object({
  homeownerRelevant: z.boolean().default(false),
  lifecycleAdvanced: z.boolean().default(false),
  propertyEffectConfirmed: z.boolean().default(false),
  urgentSafetyCondition: z.boolean().default(false),
  canonicalActionPriority: z.enum(['NOW', 'SOON', 'PLAN', 'CONSIDER'])
    .nullable()
    .default(null),
});

export const propertyChangeEmissionSchema = z.object({
  propertyId: z.string().uuid(),
  sourceType: z.string().trim().min(2).max(120)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  sourceEntityId: z.string().trim().min(1).max(300),
  sourceRevision: z.string().trim().min(1).max(160),
  sourceRevisionOrdinal: z.number().int().nonnegative(),
  changeType: propertyChangeTypeSchema,
  occurredAt: z.coerce.date().nullable().optional(),
  detectedAt: z.coerce.date().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  sourceHealth: propertyChangeSourceHealthSchema,
  signals: propertyChangeSignalsSchema,
  canonicalActionId: z.string().uuid().nullable().optional(),
  canonicalEventId: z.string().uuid().nullable().optional(),
});

export const propertyChangeDismissSchema = z.object({
  reason: z.string().trim().min(2).max(500),
});

export const propertyChangeDeliverySchema = z.object({
  userId: z.string().uuid(),
  deliveredAt: z.coerce.date().optional(),
});

export type PropertyChangeEmissionInput =
  z.infer<typeof propertyChangeEmissionSchema>;
export type PropertyChangeSignals = z.infer<typeof propertyChangeSignalsSchema>;
export type PropertyChangeSourceHealth =
  z.infer<typeof propertyChangeSourceHealthSchema>;
