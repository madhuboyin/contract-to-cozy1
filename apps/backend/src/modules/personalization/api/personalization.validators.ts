import { z } from 'zod';

export const OptionalProfileEnableSchema = z.object({
  consentAccepted: z.literal(true),
}).strict();

export const RecommendationFeedbackSchema = z.object({
  eventId: z.string().uuid(),
  type: z.enum([
    'VIEWED', 'EXPANDED', 'SAVED', 'DISMISSED', 'SNOOZED', 'NOT_RELEVANT',
    'COMPLAINT', 'RECOMMENDATION_OVERRIDDEN', 'RECOMMENDATION_REVERSED', 'PROFILE_CORRECTED',
  ]),
  explicit: z.boolean(),
  reasonCode: z.enum(['ALREADY_DONE', 'TOO_EXPENSIVE', 'NOT_APPLICABLE', 'BAD_TIMING', 'WRONG_PROFILE', 'OTHER']).nullable().optional(),
  comment: z.string().trim().max(500).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.type === 'COMPLAINT' && !value.comment) {
    ctx.addIssue({ code: 'custom', path: ['comment'], message: 'A complaint requires a comment.' });
  }
  if (['COMPLAINT', 'RECOMMENDATION_OVERRIDDEN', 'RECOMMENDATION_REVERSED', 'PROFILE_CORRECTED'].includes(value.type) && !value.explicit) {
    ctx.addIssue({ code: 'custom', path: ['explicit'], message: 'Incident-producing feedback must be explicit.' });
  }
});

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
