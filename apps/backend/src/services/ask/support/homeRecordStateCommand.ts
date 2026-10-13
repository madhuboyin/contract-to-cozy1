// Home Record state inside Ask (register P2 "Documents and Home Records"; FRD v1.350). Pure: declared messages, action ids, forms and validation.
// Archive, the buyer's own verification mark, and the period a record is in effect. Trash (which needs a decision about the links evidence depends on),
// retention and legal hold (owner-only), versions, uploads and links stay where the record is managed.
import { z } from 'zod';

export const HOME_RECORD_ENTITY_TYPE = 'PROPERTY_RECORD';
export const HOME_RECORD_MESSAGES = {
  ARCHIVE: 'Archive this home record.',
  VERIFICATION: 'Record whether I have verified this home record.',
  EFFECTIVE_PERIOD: 'Set the period this home record is in effect.',
} as const;
export type HomeRecordKind = keyof typeof HOME_RECORD_MESSAGES;
export const HOME_RECORD_ACTION_IDS = { ARCHIVE: 'home-record-archive', VERIFICATION: 'home-record-verification', EFFECTIVE_PERIOD: 'home-record-effective-period' } as const;
export type HomeRecordFormKind = Exclude<HomeRecordKind, 'ARCHIVE'>;
export const HOME_RECORD_CAPTURE_KEYS: Record<HomeRecordFormKind, string> = { VERIFICATION: 'HOME_RECORD_VERIFICATION', EFFECTIVE_PERIOD: 'HOME_RECORD_EFFECTIVE_PERIOD' };
export const homeRecordKindFromMessage = (message: string): HomeRecordKind | null =>
  ((Object.entries(HOME_RECORD_MESSAGES) as Array<[HomeRecordKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const homeRecordFormKindFromCaptureKey = (key: string): HomeRecordFormKind | null =>
  ((Object.entries(HOME_RECORD_CAPTURE_KEYS) as Array<[HomeRecordFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

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
} as const;
export const parseHomeRecordAnswer = (kind: HomeRecordFormKind, answer: unknown) =>
  (HOME_RECORD_SCHEMAS[kind] as z.ZodType<Record<string, string | undefined>>).safeParse(answer);
