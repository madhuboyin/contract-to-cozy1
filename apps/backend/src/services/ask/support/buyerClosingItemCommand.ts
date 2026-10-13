// Lender conditions and title or escrow issues inside Ask (register P2 "Buyer Closing"; FRD v1.346). Pure: declared messages, action ids, forms and
// validation, mirroring the service schemas. Two trackers with one shape: a category, a title, notes, a due date and whether it holds up closing.
//
// Waiving or resolving records the buyer's own reading; the lender or the title professional decides. Ask never tells anyone to close.
import { z } from 'zod';

export const CLOSING_ITEM_ENTITY_TYPES = { LENDER: 'BUYER_LENDER_CONDITION', TITLE: 'BUYER_TITLE_ESCROW_ISSUE' } as const;
export const CLOSING_ITEM_MESSAGES = {
  LENDER_ADD: 'Add a lender condition.',
  LENDER_UPDATE: 'Update where this lender condition stands.',
  TITLE_ADD: 'Add a title or escrow issue.',
  TITLE_UPDATE: 'Update where this title or escrow issue stands.',
  LENDER_APPRAISAL: 'Update my appraisal status.',
  LENDER_UNDERWRITING: 'Update my underwriting status.',
} as const;
export type ClosingItemKind = keyof typeof CLOSING_ITEM_MESSAGES;
export const CLOSING_ITEM_ACTION_IDS = {
  LENDER_ADD: 'closing-lender-condition-add', LENDER_UPDATE: 'closing-lender-condition-update', TITLE_ADD: 'closing-title-issue-add', TITLE_UPDATE: 'closing-title-issue-update',
  LENDER_APPRAISAL: 'closing-lender-appraisal', LENDER_UNDERWRITING: 'closing-lender-underwriting',
} as const;
export const CLOSING_ITEM_CAPTURE_KEYS: Record<ClosingItemKind, string> = {
  LENDER_ADD: 'BUYER_LENDER_CONDITION_ADD', LENDER_UPDATE: 'BUYER_LENDER_CONDITION_UPDATE', TITLE_ADD: 'BUYER_TITLE_ISSUE_ADD', TITLE_UPDATE: 'BUYER_TITLE_ISSUE_UPDATE',
  LENDER_APPRAISAL: 'BUYER_LENDER_APPRAISAL', LENDER_UNDERWRITING: 'BUYER_LENDER_UNDERWRITING',
};
export const closingItemKindFromMessage = (message: string): ClosingItemKind | null =>
  ((Object.entries(CLOSING_ITEM_MESSAGES) as Array<[ClosingItemKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const closingItemKindFromCaptureKey = (key: string): ClosingItemKind | null =>
  ((Object.entries(CLOSING_ITEM_CAPTURE_KEYS) as Array<[ClosingItemKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;
export const isUpdateKind = (kind: ClosingItemKind) => kind === 'LENDER_UPDATE' || kind === 'TITLE_UPDATE';
/** The lender readiness record itself (appraisal and underwriting), not an item on it. */
export const isReadinessKind = (kind: ClosingItemKind) => kind === 'LENDER_APPRAISAL' || kind === 'LENDER_UNDERWRITING';
export const APPRAISAL_STATUS_LABELS: Record<string, string> = {
  NOT_ORDERED: 'Not ordered', ORDERED: 'Ordered', SCHEDULED: 'Scheduled', COMPLETED: 'Completed', ISSUE_REPORTED: 'A problem was reported', RESOLVED: 'Resolved',
};
export const UNDERWRITING_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started', IN_REVIEW: 'In review', CONDITIONAL: 'Conditional', USER_RECORDED_CLEAR_TO_CLOSE: 'Clear to close, as you recorded it',
};
export const closingItemTracker = (kind: ClosingItemKind): 'LENDER' | 'TITLE' => (kind.startsWith('LENDER') ? 'LENDER' : 'TITLE');

export const LENDER_CATEGORIES = [
  ['INCOME_ASSET', 'Income or assets'], ['CREDIT', 'Credit'], ['APPRAISAL', 'Appraisal'], ['INSURANCE_PROOF', 'Proof of insurance'], ['TITLE', 'Title'],
  ['FINAL_VERIFICATION', 'Final verification'], ['OTHER', 'Other'],
] as const;
export const TITLE_CATEGORIES = [
  ['TITLE_EXCEPTION', 'A title exception'], ['LIEN_JUDGMENT', 'A lien or judgment'], ['EASEMENT', 'An easement'], ['VESTING_DEED_NAME', 'Vesting or the name on the deed'],
  ['LEGAL_DESCRIPTION', 'The legal description'], ['SURVEY', 'The survey'], ['ASSOCIATION', 'The association'], ['MUNICIPAL_PERMIT_COO', 'A permit or certificate of occupancy'],
  ['SEPTIC_WELL', 'Septic or well'], ['OTHER', 'Other'],
] as const;
export const LENDER_STATUS_LABELS: Record<string, string> = { OPEN: 'Open', SUBMITTED: 'Submitted to the lender', SATISFIED: 'Satisfied', WAIVED: 'Set aside' };
export const TITLE_STATUS_LABELS: Record<string, string> = { OPEN: 'Open', PROFESSIONAL_REVIEW: 'With a professional', RESOLVED: 'Resolved', WAIVED: 'Set aside' };

const blank = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]);
const keys = (pairs: ReadonlyArray<readonly [string, string]>) => pairs.map((p) => p[0]) as [string, ...string[]];
const notes = z.preprocess(blank, z.string().trim().max(2000).optional());
const due = z.preprocess(blank, exactDate.optional());
const yesNo = z.enum(['YES', 'NO']);
export const CLOSING_ITEM_SCHEMAS = {
  LENDER_ADD: z.object({ category: z.enum(keys(LENDER_CATEGORIES)), title: z.string().trim().min(1).max(200), notes, dueDate: due, blocking: yesNo }).strict(),
  LENDER_UPDATE: z.object({ status: z.enum(['OPEN', 'SUBMITTED', 'SATISFIED', 'WAIVED']), notes }).strict(),
  TITLE_ADD: z.object({ category: z.enum(keys(TITLE_CATEGORIES)), title: z.string().trim().min(1).max(200), notes, dueDate: due, blocking: yesNo }).strict(),
  TITLE_UPDATE: z.object({ status: z.enum(['OPEN', 'PROFESSIONAL_REVIEW', 'RESOLVED', 'WAIVED']), notes }).strict(),
  LENDER_APPRAISAL: z.object({
    status: z.enum(['NOT_ORDERED', 'ORDERED', 'SCHEDULED', 'COMPLETED', 'ISSUE_REPORTED', 'RESOLVED']),
    orderedDate: due, scheduledDate: due, completedDate: due, issueNotes: notes,
  }).strict(),
  LENDER_UNDERWRITING: z.object({ status: z.enum(['NOT_STARTED', 'IN_REVIEW', 'CONDITIONAL', 'USER_RECORDED_CLEAR_TO_CLOSE']) }).strict(),
} as const;
export const parseClosingItemAnswer = (kind: ClosingItemKind, answer: unknown) =>
  (CLOSING_ITEM_SCHEMAS[kind] as z.ZodType<Record<string, string | undefined>>).safeParse(answer);
/** An item still needing attention may be updated; a settled one is left as recorded. */
export const closingItemUpdatable = (tracker: 'LENDER' | 'TITLE', status: string) =>
  tracker === 'LENDER' ? status === 'OPEN' || status === 'SUBMITTED' : status === 'OPEN' || status === 'PROFESSIONAL_REVIEW';
