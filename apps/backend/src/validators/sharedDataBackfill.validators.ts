import { z } from 'zod';

export const sharedDataBackfillScopeQuerySchema = z.object({
  query: z.object({
    propertyId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    startAfterPropertyId: z.string().uuid().optional(),
  }),
});

export const runSharedDataBackfillBodySchema = z.object({
  propertyId: z.string().uuid().optional(),
  dryRun: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  startAfterPropertyId: z.string().uuid().optional(),
  includePreference: z.coerce.boolean().optional(),
  includeAssumptions: z.coerce.boolean().optional(),
  includeSignals: z.coerce.boolean().optional(),
});
