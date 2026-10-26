// Renovation start-readiness controls inside Ask (register P1 "Renovation Risk Advisor"; FRD v1.324). Pure: declared messages, action ids, the forms and their
// validation (the route's own schemas, mirrored).
//
// What a household can do to a readiness item: refresh the whole evaluation, acknowledge an open blocker that the rules allow to be overridden (an owner's
// decision, with a reason and an explicit risk acknowledgement), revoke that acknowledgement, or reopen an item that was manually marked satisfied. Marking an
// item satisfied needs an evidence document from the property's record (FRD v1.358: a Home Record the whole household can see, picked from a list, since the
// case is shared). Authority, safety and source-controlled blockers cannot be overridden, and the service says so.
import { z } from 'zod';

export const RENOVATION_READINESS_CASE_ENTITY_TYPE = 'RENOVATION_READINESS_CASE';
export const RENOVATION_READINESS_ITEM_ENTITY_TYPE = 'RENOVATION_READINESS_ITEM';
export const RENOVATION_COMPLIANCE_CONDITION_ENTITY_TYPE = 'RENOVATION_COMPLIANCE_CONDITION';
export const READINESS_COMMAND_MESSAGES = {
  REFRESH: 'Refresh the readiness check for this renovation case.',
  ACKNOWLEDGE: 'Acknowledge the risk of this open readiness item.',
  REVOKE: 'Withdraw the acknowledgement on this readiness item.',
  REOPEN: 'Reopen this readiness item.',
  SATISFY: 'Mark this readiness item satisfied with a document.',
  HANDOFF: 'Create the execution project for this renovation case.',
  GENERATE: 'Generate the requirements research for this renovation case.',
  SATISFY_CONDITION: 'Mark this compliance condition satisfied with a document.',
  ATTACH_RECORD: 'Attach a permit or HOA record to this renovation case.',
} as const;
export type ReadinessCommandKind = keyof typeof READINESS_COMMAND_MESSAGES;
export const READINESS_COMMAND_ACTION_IDS = {
  REFRESH: 'renovation-readiness-refresh', ACKNOWLEDGE: 'renovation-readiness-acknowledge', REVOKE: 'renovation-readiness-revoke', REOPEN: 'renovation-readiness-reopen', SATISFY: 'renovation-readiness-satisfy', HANDOFF: 'renovation-readiness-handoff', GENERATE: 'renovation-readiness-generate', SATISFY_CONDITION: 'renovation-condition-satisfy', ATTACH_RECORD: 'renovation-compliance-attach',
} as const;
export const readinessCommandKindFromMessage = (message: string): ReadinessCommandKind | null =>
  ((Object.entries(READINESS_COMMAND_MESSAGES) as Array<[ReadinessCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const readinessCommandEntityType = (kind: ReadinessCommandKind) => kind === 'SATISFY_CONDITION' ? RENOVATION_COMPLIANCE_CONDITION_ENTITY_TYPE : (kind === 'REFRESH' || kind === 'HANDOFF' || kind === 'GENERATE' || kind === 'ATTACH_RECORD' ? RENOVATION_READINESS_CASE_ENTITY_TYPE : RENOVATION_READINESS_ITEM_ENTITY_TYPE);
/** Acknowledging a risk and creating the execution project are an owner's decisions; both routes are owner-only. */
export const readinessKindNeedsOwner = (kind: ReadinessCommandKind) => kind === 'ACKNOWLEDGE' || kind === 'REVOKE' || kind === 'HANDOFF';

export type ReadinessFormKind = 'ACKNOWLEDGE' | 'REVOKE' | 'REOPEN' | 'SATISFY' | 'SATISFY_CONDITION' | 'ATTACH_RECORD' | 'HANDOFF';
/** The kinds that act on one readiness item (the handoff acts on the case). */
export type ReadinessItemFormKind = Exclude<ReadinessFormKind, 'HANDOFF' | 'ATTACH_RECORD'>;
export const READINESS_FORM_CAPTURE_KEYS: Record<ReadinessFormKind, string> = {
  ACKNOWLEDGE: 'RENOVATION_READINESS_ACKNOWLEDGE', REVOKE: 'RENOVATION_READINESS_REVOKE', REOPEN: 'RENOVATION_READINESS_REOPEN', SATISFY: 'RENOVATION_READINESS_SATISFY',
  HANDOFF: 'RENOVATION_READINESS_HANDOFF', SATISFY_CONDITION: 'RENOVATION_COMPLIANCE_CONDITION_SATISFY',
  ATTACH_RECORD: 'RENOVATION_COMPLIANCE_ATTACH_RECORD',
};
export const readinessFormKindFromCaptureKey = (key: string): ReadinessFormKind | null =>
  ((Object.entries(READINESS_FORM_CAPTURE_KEYS) as Array<[ReadinessFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const HANDOFF_PROJECT_TYPES = [
  'ROOF_REPLACEMENT', 'HVAC_REPLACEMENT', 'HVAC_REPAIR', 'KITCHEN_REMODEL', 'BATHROOM_REMODEL', 'ELECTRICAL_PANEL', 'PLUMBING_REPIPING', 'WATER_HEATER',
  'FOUNDATION_WORK', 'WINDOW_REPLACEMENT', 'FLOORING', 'PAINTING_INTERIOR', 'PAINTING_EXTERIOR', 'DECK_PATIO', 'ADDITION', 'SEWER_LINE',
  'SOLAR_INSTALLATION', 'LANDSCAPING_MAJOR', 'GENERAL_REPAIR', 'CUSTOM',
] as const;
export const HANDOFF_FUNDING_LABELS: Record<string, string> = { UNDECIDED: 'Not decided yet', SELF_PAID: 'Self-paid', COVERED: 'Covered (insurance or warranty)', MIXED: 'Mixed' };
const blankToUndefined = (value: unknown) => (value === '' || value === null || value === undefined ? undefined : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]);

export const READINESS_FORM_SCHEMAS = {
  ACKNOWLEDGE: z.object({ reason: z.string().trim().min(20).max(5000), riskAcknowledged: z.literal('YES') }).strict(),
  REVOKE: z.object({ reason: z.string().trim().min(10).max(5000) }).strict(),
  REOPEN: z.object({ notes: z.string().trim().min(1).max(5000) }).strict(),
  SATISFY: z.object({ evidenceDocumentId: z.string().trim().min(1).max(160), notes: z.string().trim().min(1).max(5000) }).strict(),
  // One choice among the offered records, as "<TYPE>:<id>"; the route's own input is split from it.
  ATTACH_RECORD: z.object({ record: z.string().trim().regex(/^(?:PERMIT|HOA_APPROVAL):[^:\s]{1,160}$/) }).strict(),
  SATISFY_CONDITION: z.object({ evidenceDocumentId: z.string().trim().min(1).max(160), notes: z.string().trim().min(1).max(5000) }).strict(),
  HANDOFF: z.object({
    projectType: z.enum(HANDOFF_PROJECT_TYPES),
    contractorName: z.preprocess(blankToUndefined, z.string().trim().min(1).max(200).optional()),
    contractorLicense: z.preprocess(blankToUndefined, z.string().trim().min(1).max(100).optional()),
    // Dollars as typed; blank is an unknown amount, never zero (owner ruling D-H5). A typed 0 is a known zero.
    contractAmount: z.preprocess((value) => (value === '' || value === null || value === undefined ? undefined : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : value),
      z.number().finite().min(0).max(1_000_000_000).optional()),
    // Owner ruling D-H7: funding is chosen or left undecided, never assumed.
    fundingMode: z.enum(['UNDECIDED', 'SELF_PAID', 'COVERED', 'MIXED']),
    startDate: exactDate,
    expectedEndDate: z.preprocess(blankToUndefined, exactDate.optional()),
  }).strict(),
} as const;
export type ReadinessFormValues = Record<string, unknown>;
export function parseReadinessFormAnswer(kind: ReadinessFormKind, answer: unknown): { success: true; data: ReadinessFormValues } | { success: false } {
  const parsed = (READINESS_FORM_SCHEMAS[kind] as z.ZodType).safeParse(answer);
  if (!parsed.success) return { success: false };
  // The end date cannot precede the start date, as the route's schema requires.
  const data = parsed.data as ReadinessFormValues;
  if (kind === 'HANDOFF' && typeof data.expectedEndDate === 'string' && typeof data.startDate === 'string' && data.expectedEndDate < data.startDate) return { success: false };
  return { success: true, data };
}

/** The request the canonical handoff takes, from a validated form. PLANNED only; no documents (owner rulings D-H2, D-H4). */
export function handoffServiceInput(form: ReadinessFormValues, fulfillmentMode: 'PROVIDER' | 'DIY', idempotencyKey: string) {
  return {
    projectType: String(form.projectType),
    fulfillmentMode,
    fundingMode: String(form.fundingMode),
    ...(typeof form.contractorName === 'string' ? { contractorName: form.contractorName } : {}),
    ...(typeof form.contractorLicense === 'string' ? { contractorLicense: form.contractorLicense } : {}),
    ...(typeof form.contractAmount === 'number' ? { contractAmountCents: Math.round(form.contractAmount * 100) } : {}),
    startDate: String(form.startDate),
    ...(typeof form.expectedEndDate === 'string' ? { expectedEndDate: form.expectedEndDate } : {}),
    intakeMode: 'PLANNED' as const,
    contractDocumentIds: [] as string[],
    idempotencyKey,
  };
}

/** The body the canonical service takes, from a validated form. */
export function readinessServiceInput(kind: ReadinessItemFormKind, form: ReadinessFormValues) {
  if (kind === 'ACKNOWLEDGE') return { action: 'ACKNOWLEDGE' as const, reason: String(form.reason), riskAcknowledged: true as const };
  if (kind === 'REVOKE') return { action: 'REVOKE' as const, reason: String(form.reason) };
  // A compliance condition is updated through the compliance workflow's own input (route schema: status, verificationNotes, sourceDocumentId).
  if (kind === 'SATISFY_CONDITION') return { status: 'SATISFIED' as const, verificationNotes: String(form.notes), sourceDocumentId: String(form.evidenceDocumentId) };
  if (kind === 'SATISFY') return { status: 'SATISFIED' as const, evidenceDocumentId: String(form.evidenceDocumentId), satisfactionNotes: String(form.notes) };
  return { status: 'OPEN' as const, satisfactionNotes: String(form.notes) };
}

/** The route's input for attaching a compliance record, from the validated choice ("PERMIT:<id>" or "HOA_APPROVAL:<id>"). */
export function attachRecordServiceInput(form: ReadinessFormValues): { subjectType: 'PERMIT' | 'HOA_APPROVAL'; subjectId: string } {
  const [subjectType, ...rest] = String(form.record).split(':');
  return { subjectType: subjectType as 'PERMIT' | 'HOA_APPROVAL', subjectId: rest.join(':') };
}
