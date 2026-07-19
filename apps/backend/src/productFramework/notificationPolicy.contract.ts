import { z } from 'zod';

export const NOTIFICATION_CATEGORIES = [
  'SAFETY', 'ACTIVE_DAMAGE', 'MATERIAL_DEADLINE', 'WORKFLOW', 'MAINTENANCE',
  'COVERAGE', 'PROJECT', 'RECALL', 'ACCOUNT', 'GENERAL', 'ALL',
] as const;
export const NOTIFICATION_URGENCIES = ['ROUTINE', 'MATERIAL', 'URGENT', 'CRITICAL'] as const;
export const NOTIFICATION_CADENCES = ['IMMEDIATE', 'DAILY_DIGEST', 'WEEKLY_BRIEF', 'MUTED'] as const;
export const NOTIFICATION_OUTCOMES = ['OPENED', 'USEFUL', 'NOT_USEFUL', 'MUTE_TYPE', 'NOT_RELEVANT', 'ALREADY_HANDLED'] as const;

export const NotificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES);
export const NotificationUrgencySchema = z.enum(NOTIFICATION_URGENCIES);
export const NotificationCadenceSchema = z.enum(NOTIFICATION_CADENCES);
export const NotificationOutcomeSchema = z.enum(NOTIFICATION_OUTCOMES);

export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;
export type NotificationUrgency = z.infer<typeof NotificationUrgencySchema>;
export type NotificationCadence = z.infer<typeof NotificationCadenceSchema>;
export type NotificationOutcome = z.infer<typeof NotificationOutcomeSchema>;

export const NotificationPreferenceInputSchema = z.object({
  propertyId: z.string().uuid().nullable().optional(),
  memberUserId: z.string().uuid().nullable().optional(),
  category: NotificationCategorySchema,
  channel: z.enum(['IN_APP', 'EMAIL', 'PUSH', 'SMS', 'WHATSAPP']),
  enabled: z.boolean(),
  cadence: NotificationCadenceSchema,
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  timezone: z.string().trim().min(1).max(100).default('UTC'),
}).strict();

export function notificationScopeKey(input: { propertyId?: string | null; memberUserId?: string | null }) {
  if (input.propertyId && input.memberUserId) return `PROPERTY:${input.propertyId}:MEMBER:${input.memberUserId}`;
  if (input.propertyId) return `PROPERTY:${input.propertyId}`;
  if (input.memberUserId) return `MEMBER:${input.memberUserId}`;
  return 'GLOBAL';
}
