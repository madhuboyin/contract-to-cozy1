import { z } from 'zod';

export const PilotOptInSchema = z.object({
  consentAccepted: z.literal(true),
}).strict();

export const PilotFeedbackSchema = z.object({
  eventId: z.string().uuid(),
  type: z.enum(['VIEWED', 'EXPANDED', 'SAVED', 'DISMISSED', 'SNOOZED', 'NOT_RELEVANT']),
  explicit: z.boolean(),
  reasonCode: z.enum(['ALREADY_DONE', 'TOO_EXPENSIVE', 'NOT_APPLICABLE', 'BAD_TIMING', 'WRONG_PROFILE', 'OTHER']).nullable().optional(),
  comment: z.string().trim().max(500).nullable().optional(),
}).strict();

export const PilotProfileAnswerSchema = z.object({
  idempotencyKey: z.string().uuid(),
  action: z.enum(['ANSWERED', 'SKIPPED', 'SNOOZED']),
  answerJson: z.unknown().optional(),
}).strict();
