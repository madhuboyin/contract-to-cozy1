import { z } from 'zod';
import { HomeTwinScenarioType } from '@prisma/client';

export const initTwinBodySchema = z.object({
  forceRefresh: z.boolean().optional().default(false),
});

export const createScenarioBodySchema = z.object({
  name: z.string().min(1).max(255),
  scenarioType: z.nativeEnum(HomeTwinScenarioType),
  description: z.string().max(1000).optional().nullable(),
  inputPayload: z.record(z.string(), z.unknown()),
  isPinned: z.boolean().optional().default(false),
});

export const listScenariosQuerySchema = z.object({
  status: z
    .enum(['DRAFT', 'READY', 'COMPUTED', 'FAILED', 'ARCHIVED'])
    .optional(),
  includeArchived: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .optional()
    .default(false),
});
