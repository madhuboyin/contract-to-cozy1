import { z } from 'zod';

export const radarSourceRunBodySchema = z.object({
  propertyId: z.string().uuid(),
});

export const radarSourceTestBodySchema = z.object({
  propertyId: z.string().uuid().optional(),
});

export const radarReplayBodySchema = z.object({
  propertyId: z.string().uuid().optional(),
});

export const radarSourcePauseBodySchema = z.object({
  paused: z.boolean(),
  reason: z.string().trim().min(5).max(500),
});
