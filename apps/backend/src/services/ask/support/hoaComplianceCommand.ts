// HOA Compliance writes inside Ask (register P2 "HOA Compliance"; FRD v1.328). Pure: declared messages, action ids, the forms and their validation, and the
// bodies the canonical HOA service takes.
//
// What the household can say is the REPORTED status of an approval request (its own word). An association's decision is recorded with a truth layer, a source
// and evidence, and that stays on the page; so do conditions and a denial reason, which the service refuses without a decision. A blank in a change form leaves
// the recorded value alone, as the service does for an undefined field.
import { z } from 'zod';

export const HOA_PROPERTY_ENTITY_TYPE = 'HOA_PROPERTY';
export const HOA_APPROVAL_ENTITY_TYPE = 'HOA_APPROVAL_RECORD';
export const HOA_COMMAND_MESSAGES = {
  ASSOCIATION: 'Set up or update the HOA details for this home.',
  APPROVAL_ADD: 'Add an HOA approval request.',
  APPROVAL_EDIT: 'Change this HOA approval request.',
  APPROVAL_REMOVE: 'Remove this HOA approval request.',
  VIOLATION: 'Report an HOA violation notice.',
} as const;
export type HoaCommandKind = keyof typeof HOA_COMMAND_MESSAGES;
export const HOA_COMMAND_ACTION_IDS = {
  ASSOCIATION: 'hoa-association', APPROVAL_ADD: 'hoa-approval-add', APPROVAL_EDIT: 'hoa-approval-edit', APPROVAL_REMOVE: 'hoa-approval-remove', VIOLATION: 'hoa-violation-report',
} as const;
export const hoaCommandKindFromMessage = (message: string): HoaCommandKind | null =>
  ((Object.entries(HOA_COMMAND_MESSAGES) as Array<[HoaCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const hoaCommandEntityType = (kind: HoaCommandKind) => (kind === 'APPROVAL_EDIT' || kind === 'APPROVAL_REMOVE' ? HOA_APPROVAL_ENTITY_TYPE : HOA_PROPERTY_ENTITY_TYPE);
export type HoaFormKind = 'ASSOCIATION' | 'APPROVAL_ADD' | 'APPROVAL_EDIT' | 'VIOLATION';
export const HOA_FORM_CAPTURE_KEYS: Record<HoaFormKind, string> = {
  ASSOCIATION: 'HOA_ASSOCIATION', APPROVAL_ADD: 'HOA_APPROVAL_ADD', APPROVAL_EDIT: 'HOA_APPROVAL_EDIT', VIOLATION: 'HOA_VIOLATION',
};
export const hoaFormKindFromCaptureKey = (key: string): HoaFormKind | null =>
  ((Object.entries(HOA_FORM_CAPTURE_KEYS) as Array<[HoaFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const HOA_WORK_TYPES = ['EXTERIOR_PAINT', 'FENCE', 'ROOFING', 'ROOM_ADDITION', 'DECK_PATIO', 'LANDSCAPING', 'SOLAR', 'WINDOWS_DOORS', 'DRIVEWAY', 'SHED_OUTBUILDING', 'POOL', 'SATELLITE_ANTENNA', 'OTHER'] as const;
export const HOA_WORK_TYPE_LABELS: Record<string, string> = {
  EXTERIOR_PAINT: 'Exterior paint', FENCE: 'Fence', ROOFING: 'Roofing', ROOM_ADDITION: 'Room addition', DECK_PATIO: 'Deck or patio', LANDSCAPING: 'Landscaping', SOLAR: 'Solar',
  WINDOWS_DOORS: 'Windows and doors', DRIVEWAY: 'Driveway', SHED_OUTBUILDING: 'Shed or outbuilding', POOL: 'Pool', SATELLITE_ANTENNA: 'Satellite dish or antenna', OTHER: 'Something else',
};
export const HOA_REPORTED_STATUSES = ['NOT_SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'WITHDRAWN'] as const;
export const HOA_REPORTED_STATUS_LABELS: Record<string, string> = {
  NOT_SUBMITTED: 'Not submitted yet', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', CORRECTION_REQUESTED: 'Correction requested', RESUBMITTED: 'Resubmitted', WITHDRAWN: 'Withdrawn',
};
export const HOA_DUES_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'ANNUAL'] as const;
export const HOA_DUES_LABELS: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUAL: 'Yearly' };
export const HOA_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export const HOA_SEVERITY_LABELS: Record<string, string> = { INFO: 'For information', WARNING: 'Needs attention', CRITICAL: 'Urgent' };

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable()).optional();
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
const optionalDate = z.preprocess(blank, exactDate.nullable()).optional();
const dollars = z.preprocess(blank, z.coerce.number().finite().min(0).max(100_000_000).nullable()).optional();

export const HOA_FORM_SCHEMAS = {
  ASSOCIATION: z.object({
    name: z.string().trim().min(1).max(200), managementCompany: text(200), contactName: text(200), contactEmail: z.preprocess(blank, z.string().trim().email().nullable()).optional(),
    contactPhone: text(60), duesAmount: dollars, duesFrequency: z.preprocess(blank, z.enum(HOA_DUES_FREQUENCIES).nullable()).optional(), nextDueDate: optionalDate, notes: text(2000),
  }).strict(),
  APPROVAL_ADD: z.object({
    workType: z.enum(HOA_WORK_TYPES), description: text(1000), reportedStatus: z.preprocess(blank, z.enum(HOA_REPORTED_STATUSES).nullable()).optional(),
    submittedDate: optionalDate, expirationDate: optionalDate, notes: text(2000),
  }).strict(),
  APPROVAL_EDIT: z.object({
    workType: z.preprocess(blank, z.enum(HOA_WORK_TYPES).nullable()).optional(), description: text(1000), reportedStatus: z.preprocess(blank, z.enum(HOA_REPORTED_STATUSES).nullable()).optional(),
    submittedDate: optionalDate, expirationDate: optionalDate, notes: text(2000),
  }).strict(),
  VIOLATION: z.object({
    summary: z.string().trim().min(1).max(200), workType: z.preprocess(blank, z.enum(HOA_WORK_TYPES).nullable()).optional(), description: text(2000),
    cureDeadline: optionalDate, fine: dollars, severity: z.preprocess(blank, z.enum(HOA_SEVERITIES).nullable()).optional(),
  }).strict(),
} as const;
export type HoaFormValues = Record<string, unknown>;
export function parseHoaFormAnswer(kind: HoaFormKind, answer: unknown): { success: true; data: HoaFormValues } | { success: false; reason: 'INVALID' | 'NOTHING' } {
  const parsed = (HOA_FORM_SCHEMAS[kind] as z.ZodType).safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const data = Object.fromEntries(Object.entries(parsed.data as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined));
  if (kind === 'APPROVAL_EDIT' && !Object.keys(data).length) return { success: false, reason: 'NOTHING' };
  return { success: true, data };
}

const noon = (date: string) => `${date}T12:00:00.000Z`;
/** The bodies the canonical service takes (the routes' own schemas), from a validated form. */
export function hoaServiceBody(kind: HoaFormKind, v: HoaFormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const copy = (...keys: string[]) => { for (const key of keys) if (v[key] !== undefined) body[key] = v[key]; };
  const day = (key: string, as: string = key) => { if (typeof v[key] === 'string') body[as] = noon(v[key] as string); };
  if (kind === 'ASSOCIATION') {
    copy('name', 'managementCompany', 'contactName', 'contactEmail', 'contactPhone', 'duesFrequency', 'notes');
    if (typeof v.duesAmount === 'number') body.duesAmountCents = Math.round(v.duesAmount * 100);
    day('nextDueDate');
  } else if (kind === 'APPROVAL_ADD') {
    copy('workType', 'description', 'notes'); body.reportedStatus = v.reportedStatus ?? 'NOT_SUBMITTED'; day('submittedDate'); day('expirationDate'); body.documentIds = [];
  } else if (kind === 'APPROVAL_EDIT') {
    copy('workType', 'description', 'reportedStatus', 'notes'); day('submittedDate'); day('expirationDate');
  } else {
    copy('summary', 'workType', 'description', 'severity'); day('cureDeadline');
    if (typeof v.fine === 'number') body.fineAmountCents = Math.round(v.fine * 100);
  }
  return body;
}
