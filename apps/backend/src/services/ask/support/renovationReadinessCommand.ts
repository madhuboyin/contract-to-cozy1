// Renovation start-readiness controls inside Ask (register P1 "Renovation Risk Advisor"; FRD v1.324). Pure: declared messages, action ids, the forms and their
// validation (the route's own schemas, mirrored).
//
// What a household can do to a readiness item: refresh the whole evaluation, acknowledge an open blocker that the rules allow to be overridden (an owner's
// decision, with a reason and an explicit risk acknowledgement), revoke that acknowledgement, or reopen an item that was manually marked satisfied. Marking an
// item satisfied needs an evidence document from the property's record; that stays on the page. Authority, safety and source-controlled blockers cannot be
// overridden, and the service says so.
import { z } from 'zod';

export const RENOVATION_READINESS_CASE_ENTITY_TYPE = 'RENOVATION_READINESS_CASE';
export const RENOVATION_READINESS_ITEM_ENTITY_TYPE = 'RENOVATION_READINESS_ITEM';
export const READINESS_COMMAND_MESSAGES = {
  REFRESH: 'Refresh the readiness check for this renovation case.',
  ACKNOWLEDGE: 'Acknowledge the risk of this open readiness item.',
  REVOKE: 'Withdraw the acknowledgement on this readiness item.',
  REOPEN: 'Reopen this readiness item.',
} as const;
export type ReadinessCommandKind = keyof typeof READINESS_COMMAND_MESSAGES;
export const READINESS_COMMAND_ACTION_IDS = {
  REFRESH: 'renovation-readiness-refresh', ACKNOWLEDGE: 'renovation-readiness-acknowledge', REVOKE: 'renovation-readiness-revoke', REOPEN: 'renovation-readiness-reopen',
} as const;
export const readinessCommandKindFromMessage = (message: string): ReadinessCommandKind | null =>
  ((Object.entries(READINESS_COMMAND_MESSAGES) as Array<[ReadinessCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const readinessCommandEntityType = (kind: ReadinessCommandKind) => (kind === 'REFRESH' ? RENOVATION_READINESS_CASE_ENTITY_TYPE : RENOVATION_READINESS_ITEM_ENTITY_TYPE);
/** Acknowledging a risk is an owner's decision; the route is owner-only. */
export const readinessKindNeedsOwner = (kind: ReadinessCommandKind) => kind === 'ACKNOWLEDGE' || kind === 'REVOKE';

export type ReadinessFormKind = 'ACKNOWLEDGE' | 'REVOKE' | 'REOPEN';
export const READINESS_FORM_CAPTURE_KEYS: Record<ReadinessFormKind, string> = {
  ACKNOWLEDGE: 'RENOVATION_READINESS_ACKNOWLEDGE', REVOKE: 'RENOVATION_READINESS_REVOKE', REOPEN: 'RENOVATION_READINESS_REOPEN',
};
export const readinessFormKindFromCaptureKey = (key: string): ReadinessFormKind | null =>
  ((Object.entries(READINESS_FORM_CAPTURE_KEYS) as Array<[ReadinessFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const READINESS_FORM_SCHEMAS = {
  ACKNOWLEDGE: z.object({ reason: z.string().trim().min(20).max(5000), riskAcknowledged: z.literal('YES') }).strict(),
  REVOKE: z.object({ reason: z.string().trim().min(10).max(5000) }).strict(),
  REOPEN: z.object({ notes: z.string().trim().min(1).max(5000) }).strict(),
} as const;
export type ReadinessFormValues = Record<string, unknown>;
export function parseReadinessFormAnswer(kind: ReadinessFormKind, answer: unknown): { success: true; data: ReadinessFormValues } | { success: false } {
  const parsed = (READINESS_FORM_SCHEMAS[kind] as z.ZodType).safeParse(answer);
  return parsed.success ? { success: true, data: parsed.data as ReadinessFormValues } : { success: false };
}

/** The body the canonical service takes, from a validated form. */
export function readinessServiceInput(kind: ReadinessFormKind, form: ReadinessFormValues) {
  if (kind === 'ACKNOWLEDGE') return { action: 'ACKNOWLEDGE' as const, reason: String(form.reason), riskAcknowledged: true as const };
  if (kind === 'REVOKE') return { action: 'REVOKE' as const, reason: String(form.reason) };
  return { status: 'OPEN' as const, satisfactionNotes: String(form.notes) };
}
