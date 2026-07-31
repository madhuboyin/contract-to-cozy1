import { z } from 'zod';

export const homeBriefingCadenceSchema = z.enum([
  'IMMEDIATE',
  'WEEKLY',
  'MONTHLY',
  'IMPORTANT_ONLY',
]);

export const homeBriefingTopicSchema = z.enum([
  'HOME_ACTION',
  'HOME_HISTORY',
  'LOCAL_CHANGE',
  'HAZARD',
  'PROPERTY_FACT',
  'SOURCE_HEALTH',
  'OTHER',
]);

export const homeBriefingChannelSchema = z.enum([
  'IN_APP',
  'EMAIL',
  'PUSH',
]);

export const updateHomeBriefingPreferenceSchema = z.object({
  enabled: z.boolean(),
  cadence: homeBriefingCadenceSchema,
  topics: z.array(homeBriefingTopicSchema).max(7).default([]),
  channels: z.array(homeBriefingChannelSchema).min(1).max(3),
});

export const homeBriefingItemOutcomeSchema = z.object({
  outcome: z.enum(['OPENED', 'SEEN', 'ACTED', 'DISMISSED', 'NOT_USEFUL']),
  note: z.string().trim().min(2).max(500).optional(),
});

export const createHomeBriefingShareSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(10),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export type HomeBriefingTopic = z.infer<typeof homeBriefingTopicSchema>;
