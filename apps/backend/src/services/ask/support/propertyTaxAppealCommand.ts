// Property tax appeal cases inside Ask (register P1 "Property Tax"; FRD v1.322). Pure: declared messages, action ids, the forms and their validation, and the
// inputs the canonical appeal-case service takes.
//
// Declared-action only. Cozy prepares an appeal and records what the household did; it never files anything. Filing, a response, a hearing and the decision are
// things the household reports after dealing with the authority, so every confirmation says so. The case, its packet and its reminders are the canonical
// propertyTaxAppealCaseService's: this module only shapes the same inputs its route validates.
import { z } from 'zod';

export const APPEAL_PROPERTY_ENTITY_TYPE = 'PROPERTY_TAX_APPEAL_PROPERTY';
export const APPEAL_CASE_ENTITY_TYPE = 'PROPERTY_TAX_APPEAL_CASE';
export const APPEAL_REMINDER_ENTITY_TYPE = 'PROPERTY_TAX_APPEAL_REMINDER';

export const APPEAL_COMMAND_MESSAGES = {
  START: 'Start a property tax appeal case.',
  PACKET: 'Prepare the packet for this property tax appeal case.',
  FILING: 'Record that this property tax appeal was filed.',
  EVENT: 'Record a response or hearing for this property tax appeal.',
  REMINDER_ADD: 'Add a reminder to this property tax appeal case.',
  REMINDER_DONE: 'Mark this property tax appeal reminder done.',
  REMINDER_DISMISS: 'Dismiss this property tax appeal reminder.',
  DETERMINATION: 'Record the decision on this property tax appeal.',
} as const;
export type AppealCommandKind = keyof typeof APPEAL_COMMAND_MESSAGES;
export const APPEAL_COMMAND_ACTION_IDS = {
  START: 'property-tax-appeal-start', PACKET: 'property-tax-appeal-packet', FILING: 'property-tax-appeal-filing', EVENT: 'property-tax-appeal-event',
  REMINDER_ADD: 'property-tax-appeal-reminder-add', REMINDER_DONE: 'property-tax-appeal-reminder-done', REMINDER_DISMISS: 'property-tax-appeal-reminder-dismiss',
  DETERMINATION: 'property-tax-appeal-determination',
} as const;
export const appealCommandKindFromMessage = (message: string): AppealCommandKind | null =>
  ((Object.entries(APPEAL_COMMAND_MESSAGES) as Array<[AppealCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const appealCommandEntityType = (kind: AppealCommandKind) =>
  kind === 'START' ? APPEAL_PROPERTY_ENTITY_TYPE : kind === 'REMINDER_DONE' || kind === 'REMINDER_DISMISS' ? APPEAL_REMINDER_ENTITY_TYPE : APPEAL_CASE_ENTITY_TYPE;

export type AppealFormKind = 'START' | 'PACKET' | 'FILING' | 'EVENT' | 'REMINDER_ADD' | 'DETERMINATION';
export const APPEAL_FORM_CAPTURE_KEYS: Record<AppealFormKind, string> = {
  START: 'PROPERTY_TAX_APPEAL_START', PACKET: 'PROPERTY_TAX_APPEAL_PACKET', FILING: 'PROPERTY_TAX_APPEAL_FILING', EVENT: 'PROPERTY_TAX_APPEAL_EVENT',
  REMINDER_ADD: 'PROPERTY_TAX_APPEAL_REMINDER', DETERMINATION: 'PROPERTY_TAX_APPEAL_DETERMINATION',
};
export const appealFormKindFromCaptureKey = (key: string): AppealFormKind | null =>
  ((Object.entries(APPEAL_FORM_CAPTURE_KEYS) as Array<[AppealFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;
export const isAppealFormKind = (kind: AppealCommandKind): kind is AppealFormKind => kind in APPEAL_FORM_CAPTURE_KEYS;

export const APPEAL_GROUNDS = ['ASSESSED_VALUE', 'TAX_CLASS', 'EXEMPTION'] as const;
export const APPEAL_GROUND_LABELS: Record<string, string> = { ASSESSED_VALUE: 'The assessed value is too high', TAX_CLASS: 'The tax class is wrong', EXEMPTION: 'An exemption is missing or wrong' };
/** The packet's own checklist and placeholder codes (propertyTaxAppealCase.service), which it rejects anything else against. */
export const PACKET_CHECKLIST_ITEMS = [
  { code: 'VERIFY_CANONICAL_FACTS', label: 'Verify the parcel, assessment, valuation date, class, and tax year' },
  { code: 'VERIFY_GROUND_EVIDENCE', label: 'Review every cited item supporting the selected ground' },
  { code: 'VERIFY_CURRENT_FORM', label: 'Open the official site and verify the current form and instructions' },
  { code: 'COMPLETE_OFFICIAL_FORM', label: 'Complete the official form outside Contract to Cozy' },
  { code: 'REVIEW_NARRATIVE', label: 'Review and edit the evidence-grounded narrative' },
] as const;
export const PACKET_PLACEHOLDER_LABELS = {
  APPLICANT_NAME: 'Applicant name', APPLICANT_CONTACT: 'Applicant contact', REQUESTED_RESULT: 'Result you are requesting', SIGNATURE_DATE: 'Signature date',
} as const;
export const APPEAL_DETERMINATIONS = ['REDUCED', 'UPHELD', 'CLASS_CHANGED', 'EXEMPTION_ADJUSTED', 'PARTIAL', 'WITHDRAWN', 'OTHER'] as const;
export const APPEAL_DETERMINATION_LABELS: Record<string, string> = {
  REDUCED: 'Reduced', UPHELD: 'Upheld (no change)', CLASS_CHANGED: 'Tax class changed', EXEMPTION_ADJUSTED: 'Exemption adjusted', PARTIAL: 'Partly granted', WITHDRAWN: 'Withdrawn', OTHER: 'Something else',
};
export const APPEAL_STATUS_LABELS: Record<string, string> = {
  PREPARING: 'Preparing', PACKET_READY: 'Packet ready to file', FILED: 'Filed', AWAITING_RESPONSE: 'Filed, awaiting a response', RESPONSE_RECEIVED: 'Response received',
  HEARING_SCHEDULED: 'Hearing scheduled', DETERMINED: 'Decision recorded', CLOSED: 'Closed', WITHDRAWN: 'Withdrawn',
};

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
const requiredDate = exactDate;
const optionalDate = z.preprocess(blank, exactDate.nullable()).optional();
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable()).optional();
const yesNo = z.preprocess(blank, z.enum(['YES', 'NO']).nullable()).optional();
const money = z.preprocess(blank, z.coerce.number().finite().min(0).max(1_000_000_000).nullable()).optional();

const StartSchema = z.object({ ground: z.enum(APPEAL_GROUNDS), revisedNoticeDate: optionalDate, revisedNoticeQualifies: yesNo }).strict();
const PacketSchema = z.object({
  narrative: text(50, 20_000),
  checklist: z.array(z.enum(PACKET_CHECKLIST_ITEMS.map((item) => item.code) as [string, ...string[]])).max(20).default([]),
  APPLICANT_NAME: optionalText(2000), APPLICANT_CONTACT: optionalText(2000), REQUESTED_RESULT: optionalText(2000), SIGNATURE_DATE: optionalText(2000),
  reviewed: z.enum(['YES', 'NO']),
}).strict();
const FilingSchema = z.object({ filedOn: requiredDate, externalReference: text(3, 500) }).strict();
const EventSchema = z.object({ type: z.enum(['RESPONSE_RECEIVED', 'HEARING_SCHEDULED']), occurredOn: requiredDate, summary: text(3, 2000), hearingLocation: optionalText(500) }).strict();
const ReminderSchema = z.object({ title: text(3, 200), dueOn: requiredDate }).strict();
const DeterminationSchema = z.object({
  determination: z.enum(APPEAL_DETERMINATIONS), determinedOn: requiredDate, reference: text(3, 500), summary: text(3, 2000),
  finalAssessedValue: money, refundAmount: money, creditAmount: money, closeCase: z.enum(['YES', 'NO']),
}).strict();

export const APPEAL_FORM_SCHEMAS = {
  START: StartSchema, PACKET: PacketSchema, FILING: FilingSchema, EVENT: EventSchema, REMINDER_ADD: ReminderSchema, DETERMINATION: DeterminationSchema,
} as const;

export type AppealFormValues = Record<string, unknown>;
export function parseAppealFormAnswer(kind: AppealFormKind, answer: unknown): { success: true; data: AppealFormValues } | { success: false; reason: 'INVALID' | 'FUTURE' } {
  const parsed = (APPEAL_FORM_SCHEMAS[kind] as z.ZodType).safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const data = parsed.data as AppealFormValues;
  const today = new Date().toISOString().slice(0, 10);
  // Filing, a response and a decision have already happened; a hearing and a reminder are the future.
  const past = kind === 'FILING' ? data.filedOn : kind === 'DETERMINATION' ? data.determinedOn : kind === 'EVENT' && data.type === 'RESPONSE_RECEIVED' ? data.occurredOn : null;
  if (typeof past === 'string' && past > today) return { success: false, reason: 'FUTURE' };
  return { success: true, data };
}

/** An instant for a calendar date: noon UTC, or now for today (the service refuses a filing instant more than five minutes ahead). */
export function appealInstant(date: string, now = new Date()): string {
  return date === now.toISOString().slice(0, 10) ? now.toISOString() : `${date}T12:00:00.000Z`;
}

/** A stable key from the title: the service upserts on (case, key), so asking for the same reminder again updates it rather than adding a copy. */
export function appealReminderKey(title: string, sha: (text: string) => string): string {
  return `ask-${sha(title.trim().toLowerCase()).slice(0, 24)}`;
}

export interface AppealCaseShape { status: string; filedAt: unknown; packetStatus: string | null }
/** What can be done to a case now. The one place the order of an appeal is decided, shared by the answer's row actions and the confirmation's re-check. */
export function appealCaseAvailableKinds(c: AppealCaseShape): AppealCommandKind[] {
  const ended = ['DETERMINED', 'CLOSED', 'WITHDRAWN'].includes(c.status);
  const kinds: AppealCommandKind[] = [];
  if (c.status === 'PREPARING' || c.status === 'PACKET_READY') kinds.push('PACKET');
  if (c.status === 'PACKET_READY' && c.packetStatus === 'READY') kinds.push('FILING');
  if (c.filedAt && !ended) kinds.push('EVENT', 'DETERMINATION');
  if (c.status !== 'CLOSED' && c.status !== 'WITHDRAWN') kinds.push('REMINDER_ADD');
  return kinds;
}
export const APPEAL_KIND_NEEDS_A_CASE_THAT_ALLOWS_IT = 'That step is not available for this appeal case in its current state. Nothing has changed.';
