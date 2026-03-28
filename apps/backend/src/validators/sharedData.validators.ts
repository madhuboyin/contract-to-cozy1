import { z } from 'zod';

export const sharedPropertyParamsSchema = z.object({
  params: z.object({
    propertyId: z.string().uuid(),
  }),
});

export const upsertPreferenceProfileBodySchema = z.object({
  riskTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().optional(),
  deductiblePreferenceStyle: z.enum(['LOW_DEDUCTIBLE', 'BALANCED', 'HIGH_DEDUCTIBLE']).nullable().optional(),
  cashBufferPosture: z.enum(['TIGHT', 'MODERATE', 'STRONG']).nullable().optional(),
  bundlingPreference: z.enum(['NO_PREFERENCE', 'PREFER_BUNDLED', 'PREFER_UNBUNDLED']).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source: z.enum(['USER_INPUT', 'INFERRED', 'IMPORTED', 'SYSTEM_DEFAULT']).optional(),
  notesJson: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const createAssumptionSetBodySchema = z.object({
  toolKey: z.string().trim().min(1).max(120),
  scenarioKey: z.string().trim().min(1).max(120).nullable().optional(),
  preferenceProfileId: z.string().uuid().nullable().optional(),
  assumptionsJson: z.record(z.string(), z.unknown()),
});

export const assumptionSetIdParamsSchema = z.object({
  params: z.object({
    propertyId: z.string().uuid(),
    assumptionSetId: z.string().uuid(),
  }),
});

export const listAssumptionSetsQuerySchema = z.object({
  query: z.object({
    toolKey: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const listSignalsQuerySchema = z.object({
  query: z.object({
    signalKey: z.string().trim().min(1).max(120).optional(),
    roomId: z.string().uuid().optional(),
    homeItemId: z.string().uuid().optional(),
    freshOnly: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});
