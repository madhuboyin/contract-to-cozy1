// Home Operations work items inside Ask (register P2 "Maintenance and Home Operations"; FRD v1.342). Pure: declared messages, action ids, forms and
// validation. Snooze hides an item's reminders until a date and touches nothing else; reschedule overwrites its due date; accept-routine bulk-accepts
// the low-consequence candidates the desktop's batch scheduling accepts. Assignment, watchers, duplicates, evidence, approval and completion stay
// with their own flows.
import { z } from 'zod';

export const WORK_ITEM_ENTITY_TYPE = 'OPERATIONAL_WORK_ITEM';
export const WORK_ITEM_MESSAGES = {
  SNOOZE: 'Snooze this work item.',
  RESCHEDULE: 'Change the due date of this work item.',
  ACCEPT_ROUTINE: 'Accept the routine low-risk work suggested for my home.',
} as const;
export type WorkItemCommandKind = keyof typeof WORK_ITEM_MESSAGES;
export const WORK_ITEM_ACTION_IDS = { SNOOZE: 'work-item-snooze', RESCHEDULE: 'work-item-reschedule', ACCEPT_ROUTINE: 'work-items-accept-routine' } as const;
export const workItemKindFromMessage = (message: string): WorkItemCommandKind | null =>
  ((Object.entries(WORK_ITEM_MESSAGES) as Array<[WorkItemCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export type WorkItemFormKind = 'SNOOZE' | 'RESCHEDULE';
export const WORK_ITEM_FORM_CAPTURE_KEYS: Record<WorkItemFormKind, string> = { SNOOZE: 'WORK_ITEM_SNOOZE', RESCHEDULE: 'WORK_ITEM_RESCHEDULE' };
export const workItemFormKindFromCaptureKey = (key: string): WorkItemFormKind | null =>
  ((Object.entries(WORK_ITEM_FORM_CAPTURE_KEYS) as Array<[WorkItemFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const SNOOZE_CHOICES = [
  { value: 'ONE_WEEK', label: 'One week', days: 7 },
  { value: 'TWO_WEEKS', label: 'Two weeks', days: 14 },
  { value: 'ONE_MONTH', label: 'One month', days: 30 },
  { value: 'CLEAR', label: 'Stop snoozing', days: null },
] as const;
export const WorkItemSnoozeSchema = z.object({ snooze: z.enum(['ONE_WEEK', 'TWO_WEEKS', 'ONE_MONTH', 'CLEAR']) }).strict();
export const WorkItemRescheduleSchema = z.object({
  dueAt: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
  ]),
}).strict();
export const WORK_ITEM_FORM_SCHEMAS = { SNOOZE: WorkItemSnoozeSchema, RESCHEDULE: WorkItemRescheduleSchema } as const;
export function parseWorkItemAnswer(kind: WorkItemFormKind, answer: unknown) {
  return (WORK_ITEM_FORM_SCHEMAS[kind] as z.ZodType<Record<string, string>>).safeParse(answer);
}
/** The date a snooze choice resolves to, from now; null clears the snooze. */
export function snoozeUntil(choice: string, now: Date): Date | null {
  const found = SNOOZE_CHOICES.find((c) => c.value === choice);
  if (!found || found.days === null) return null;
  return new Date(now.getTime() + found.days * 86_400_000);
}

/** Work that is finished or replaced is not changed from here. */
const FINISHED_STATES = new Set(['CLOSED', 'VERIFIED']);
export const workItemChangeable = (item: { state: string; supersededByWorkItemId?: string | null }) =>
  !FINISHED_STATES.has(item.state) && !item.supersededByWorkItemId;
/** What the desktop's batch scheduling accepts: a low-consequence candidate. */
export const workItemBatchEligible = (item: { state: string; safetyTier: string; supersededByWorkItemId?: string | null }) =>
  item.state === 'CANDIDATE' && item.safetyTier === 'LOW_CONSEQUENCE' && !item.supersededByWorkItemId;
export const WORK_ITEM_BATCH_MAX = 50;
