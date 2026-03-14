import { z } from 'zod';

export const HOME_RISK_REPLAY_WINDOW_TYPES = [
  'since_built',
  'last_5_years',
  'custom_range',
] as const;

const uuidSchema = z.string().uuid();

const propertyParamsSchema = z.object({
  propertyId: uuidSchema,
});

const replayRunParamsSchema = z.object({
  propertyId: uuidSchema,
  replayRunId: uuidSchema,
});

export const homeRiskReplayPropertyParamsSchema = z.object({
  params: propertyParamsSchema,
});

export const homeRiskReplayRunParamsSchema = z.object({
  params: replayRunParamsSchema,
});

export const generateHomeRiskReplayBodySchema = z.object({
  windowType: z.enum(HOME_RISK_REPLAY_WINDOW_TYPES),
  windowStart: z.string().datetime().optional().nullable(),
  windowEnd: z.string().datetime().optional().nullable(),
  forceRegenerate: z.coerce.boolean().optional().default(false),
}).superRefine((value, ctx) => {
  if (value.windowType !== 'custom_range') return;

  if (!value.windowStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['windowStart'],
      message: 'windowStart is required when windowType is custom_range.',
    });
  }

  if (!value.windowEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['windowEnd'],
      message: 'windowEnd is required when windowType is custom_range.',
    });
  }

  if (value.windowStart && value.windowEnd) {
    const start = new Date(value.windowStart);
    const end = new Date(value.windowEnd);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

    if (start.getTime() > end.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windowStart'],
        message: 'windowStart must be less than or equal to windowEnd.',
      });
    }
  }
});

export const listHomeRiskReplayRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
