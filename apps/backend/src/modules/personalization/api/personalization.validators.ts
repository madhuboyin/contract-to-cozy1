import { z } from 'zod';

export const OptionalProfileEnableSchema = z.object({
  consentAccepted: z.literal(true),
}).strict();

export const RecommendationFeedbackSchema = z.object({
  eventId: z.string().uuid(),
  type: z.enum(['VIEWED', 'EXPANDED', 'SAVED', 'DISMISSED', 'SNOOZED', 'NOT_RELEVANT']),
  explicit: z.boolean(),
  reasonCode: z.enum(['ALREADY_DONE', 'TOO_EXPENSIVE', 'NOT_APPLICABLE', 'BAD_TIMING', 'WRONG_PROFILE', 'OTHER']).nullable().optional(),
  comment: z.string().trim().max(500).nullable().optional(),
}).strict();

export const ProfileAnswerSchema = z.object({
  idempotencyKey: z.string().uuid(),
  action: z.enum(['ANSWERED', 'SKIPPED', 'SNOOZED']),
  answerJson: z.unknown().optional(),
}).strict();

export const ModuleRecommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const ConvertRecommendationToTaskSchema = z.object({
  idempotencyKey: z.string().uuid(),
}).strict();
