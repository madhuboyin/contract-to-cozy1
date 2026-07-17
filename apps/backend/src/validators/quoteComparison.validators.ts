import { ServiceCategory } from '@prisma/client';
import { z } from 'zod';

export const getOrCreateQuoteWorkspaceSchema = z.object({
  serviceCategory: z.nativeEnum(ServiceCategory).optional().nullable(),
  inventoryItemId: z.string().uuid().optional().nullable(),
  homeAssetId: z.string().uuid().optional().nullable(),
  guidanceJourneyId: z.string().uuid().optional().nullable(),
  guidanceStepKey: z.string().max(200).optional().nullable(),
  guidanceSignalIntentFamily: z.string().max(200).optional().nullable(),
  scopeSummary: z.string().max(1000).optional().nullable(),
});
