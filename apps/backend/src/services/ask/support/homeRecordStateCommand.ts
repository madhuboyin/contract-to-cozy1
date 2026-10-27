// Home Record state inside Ask (register P2 "Documents and Home Records"; FRD v1.350). Pure: declared messages, action ids, forms and validation.
// Archive, the buyer's own verification mark, and the period a record is in effect. Since FRD v1.452: Move to trash (with the decision about the links
// evidence depends on), Restore, and retention / legal hold (owner-only), reached through one *More options* step. Versions, uploads and links stay where
// the record is managed.
import { z } from 'zod';

export const HOME_RECORD_ENTITY_TYPE = 'PROPERTY_RECORD';
export const HOME_RECORD_MESSAGES = {
  ARCHIVE: 'Archive this home record.',
  VERIFICATION: 'Record whether I have verified this home record.',
  EFFECTIVE_PERIOD: 'Set the period this home record is in effect.',
  OPTIONS: 'Show more options for this home record.',
  TRASH: 'Move this home record to the trash.',
  RESTORE: 'Restore this home record from the trash.',
  RETENTION: 'Set the retention or legal hold for this home record.',
} as const;
export type HomeRecordKind = keyof typeof HOME_RECORD_MESSAGES;
export const HOME_RECORD_ACTION_IDS = { ARCHIVE: 'home-record-archive', VERIFICATION: 'home-record-verification', EFFECTIVE_PERIOD: 'home-record-effective-period',
  OPTIONS: 'home-record-options', TRASH: 'home-record-trash', RESTORE: 'home-record-restore', RETENTION: 'home-record-retention' } as const;
export type HomeRecordFormKind = Exclude<HomeRecordKind, 'ARCHIVE' | 'OPTIONS' | 'RESTORE'>;
export const HOME_RECORD_CAPTURE_KEYS: Record<HomeRecordFormKind, string> = { VERIFICATION: 'HOME_RECORD_VERIFICATION', EFFECTIVE_PERIOD: 'HOME_RECORD_EFFECTIVE_PERIOD', TRASH: 'HOME_RECORD_TRASH', RETENTION: 'HOME_RECORD_RETENTION' };
export const homeRecordKindFromMessage = (message: string): HomeRecordKind | null =>
  ((Object.entries(HOME_RECORD_MESSAGES) as Array<[HomeRecordKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const homeRecordFormKindFromCaptureKey = (key: string): HomeRecordFormKind | null =>
  ((Object.entries(HOME_RECORD_CAPTURE_KEYS) as Array<[HomeRecordFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const LEGAL_HOLD_LABELS: Record<string, string> = { NO_CHANGE: 'Leave the hold as it is', HOLD: 'Place a legal hold', RELEASE: 'Release the hold' };
export const TRASH_IMPACT_LABELS: Record<string, string> = { KEEP_LINKS: 'Keep its links (the evidence stays linked)', REMOVE_LINKS: 'Remove its links' };
export const VERIFICATION_LABELS: Record<string, string> = { UNVERIFIED: 'Not verified', PENDING: 'Verification pending', VERIFIED: 'Verified by you', REJECTED: 'Rejected' };
const blank = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]);
const date = z.preprocess(blank, exactDate.optional());
export const HOME_RECORD_SCHEMAS = {
  VERIFICATION: z.object({ status: z.enum(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED']), notes: z.preprocess(blank, z.string().trim().max(1000).optional()) }).strict(),
  EFFECTIVE_PERIOD: z.object({ effectiveFrom: date, effectiveTo: date }).strict()
    .refine((v) => v.effectiveFrom !== undefined || v.effectiveTo !== undefined, { message: 'Fill in at least one date.' }),
  // What happens to the links that use this record as evidence (asked only when it has any).
  TRASH: z.object({ impact: z.enum(['KEEP_LINKS', 'REMOVE_LINKS']) }).strict(),
  RETENTION: z.object({ legalHold: z.enum(['NO_CHANGE', 'HOLD', 'RELEASE']), reason: z.preprocess(blank, z.string().trim().max(500).optional()), retainUntil: date }).strict()
    .refine((v) => v.legalHold !== 'HOLD' || Boolean(v.reason), { message: 'Say why it is on hold.' })
    .refine((v) => v.legalHold !== 'NO_CHANGE' || v.retainUntil !== undefined, { message: 'Choose a hold change or a keep-until date.' }),
} as const;
export const parseHomeRecordAnswer = (kind: HomeRecordFormKind, answer: unknown) =>
  (HOME_RECORD_SCHEMAS[kind] as z.ZodType<Record<string, string | undefined>>).safeParse(answer);
