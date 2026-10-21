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
  ATTACH_EXISTING: 'Attach an existing record as evidence for this work item.',
  SUBMIT_COMPLETION_EVIDENCE: 'Submit completion evidence for this work item.',
  REMOVE_EVIDENCE: 'Remove evidence from this work item.',
} as const;
export type WorkItemCommandKind = keyof typeof WORK_ITEM_MESSAGES;
export const WORK_ITEM_ACTION_IDS = { SNOOZE: 'work-item-snooze', RESCHEDULE: 'work-item-reschedule', ACCEPT_ROUTINE: 'work-items-accept-routine' } as const;
export const workItemKindFromMessage = (message: string): WorkItemCommandKind | null =>
  ((Object.entries(WORK_ITEM_MESSAGES) as Array<[WorkItemCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export type WorkItemFormKind = 'SNOOZE' | 'RESCHEDULE' | 'ATTACH_EXISTING' | 'SUBMIT_COMPLETION_EVIDENCE' | 'REMOVE_EVIDENCE';
export const WORK_ITEM_FORM_CAPTURE_KEYS: Record<WorkItemFormKind, string> = {
  SNOOZE: 'WORK_ITEM_SNOOZE', RESCHEDULE: 'WORK_ITEM_RESCHEDULE', ATTACH_EXISTING: 'WORK_ITEM_ATTACH_EXISTING',
  SUBMIT_COMPLETION_EVIDENCE: 'WORK_ITEM_SUBMIT_COMPLETION_EVIDENCE', REMOVE_EVIDENCE: 'WORK_ITEM_REMOVE_EVIDENCE',
};
/** The two kinds that write evidence from an existing record (the third form, removal, picks from what is already attached). */
export const WORK_ITEM_ATTACH_KINDS: readonly WorkItemFormKind[] = ['ATTACH_EXISTING', 'SUBMIT_COMPLETION_EVIDENCE'];
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
// A picked record travels as `TYPE:id`, the shape the picker option values use; the server re-reads it, so a forged value resolves to nothing.
export const WORK_EVIDENCE_REF_TYPES = ['DOCUMENT', 'HOME_EVENT', 'PROPERTY_FACT'] as const;
export type WorkEvidenceRefType = typeof WORK_EVIDENCE_REF_TYPES[number];
export const formatEvidenceRef = (type: WorkEvidenceRefType, id: string) => `${type}:${id}`;
export function parseEvidenceRef(value: string): { type: WorkEvidenceRefType; id: string } | null {
  const index = value.indexOf(':');
  const type = value.slice(0, index) as WorkEvidenceRefType;
  const id = value.slice(index + 1);
  return index > 0 && id && (WORK_EVIDENCE_REF_TYPES as readonly string[]).includes(type) ? { type, id } : null;
}
export const WorkItemAttachExistingSchema = z.object({ record: z.string().trim().min(3).max(200) }).strict();
export const WorkItemRemoveEvidenceSchema = z.object({ evidence: z.string().trim().min(1).max(100) }).strict();
export const WORK_ITEM_FORM_SCHEMAS = {
  SNOOZE: WorkItemSnoozeSchema, RESCHEDULE: WorkItemRescheduleSchema, ATTACH_EXISTING: WorkItemAttachExistingSchema,
  SUBMIT_COMPLETION_EVIDENCE: WorkItemAttachExistingSchema, REMOVE_EVIDENCE: WorkItemRemoveEvidenceSchema,
} as const;
export const WORK_ITEM_FORM_ERRORS: Record<WorkItemFormKind, string> = {
  SNOOZE: 'Choose how long to snooze.', RESCHEDULE: 'Choose a due date.', ATTACH_EXISTING: 'Choose a record to attach.',
  SUBMIT_COMPLETION_EVIDENCE: 'Choose a record to submit.', REMOVE_EVIDENCE: 'Choose the evidence to remove.',
};
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
