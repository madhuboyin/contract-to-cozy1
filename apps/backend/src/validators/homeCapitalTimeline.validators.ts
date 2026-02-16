// apps/backend/src/validators/homeCapitalTimeline.validators.ts
import { z } from 'zod';
import { HomeCapitalTimelineOverrideType } from '@prisma/client';

export const runTimelineBodySchema = z.object({
  horizonYears: z.number().int().min(1).max(30).optional().default(10),
});

export const createOverrideBodySchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  type: z.nativeEnum(HomeCapitalTimelineOverrideType),
  payload: z.record(z.string(), z.unknown()),
  note: z.string().max(500).optional().nullable(),
});

export const updateOverrideBodySchema = createOverrideBodySchema.partial();

export const listOverridesQuerySchema = z.object({
  inventoryItemId: z.string().uuid().optional(),
});
