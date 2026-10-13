// Three small buyer setup records inside Ask (register P2 "Buyer Closing"; FRD v1.353): how the purchase is paid for, the inspection plan and the
// title or escrow contact. Pure: declared messages, action ids, forms and validation, mirroring the service schemas. Ask records what the buyer tells
// it; it never schedules an inspector, contacts a title company or accepts bank details.
import { z } from 'zod';

export const SETUP_MESSAGES = {
  PATH_SET: 'Set how I am paying for this purchase.',
  INSPECTION_PLAN: 'Update my inspection plan.',
  TITLE_CONTACT: 'Update my title or escrow contact.',
} as const;
export type SetupKind = keyof typeof SETUP_MESSAGES;
export const SETUP_ACTION_IDS = { PATH_SET: 'buyer-setup-path', INSPECTION_PLAN: 'buyer-setup-inspection', TITLE_CONTACT: 'buyer-setup-title-contact' } as const;
export const SETUP_CAPTURE_KEYS: Record<SetupKind, string> = {
  PATH_SET: 'BUYER_SETUP_PATH_SET', INSPECTION_PLAN: 'BUYER_SETUP_INSPECTION_PLAN', TITLE_CONTACT: 'BUYER_SETUP_TITLE_CONTACT',
};
export const setupKindFromMessage = (message: string): SetupKind | null =>
  ((Object.entries(SETUP_MESSAGES) as Array<[SetupKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const setupKindFromCaptureKey = (key: string): SetupKind | null =>
  ((Object.entries(SETUP_CAPTURE_KEYS) as Array<[SetupKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const PATH_LABELS: Record<string, string> = { CASH: 'Paying cash', FINANCED: 'Financing with a loan' };
export const SPECIALIST_SCOPE_VALUES = [
  'RADON', 'SEWER_SEPTIC', 'WELL_WATER', 'PEST', 'CHIMNEY', 'ROOF', 'STRUCTURAL', 'ELECTRICAL', 'HVAC', 'POOL_SPA', 'OIL_TANK', 'MOLD', 'ENVIRONMENTAL', 'OTHER',
] as const;
export const scopeLabel = (value: string) => (value === 'SEWER_SEPTIC' ? 'Sewer or septic' : value === 'WELL_WATER' ? 'Well water' : value === 'PEST' ? 'Pests or wood-destroying insects'
  : value === 'POOL_SPA' ? 'Pool or spa' : value === 'OIL_TANK' ? 'Oil tank' : value.charAt(0) + value.slice(1).toLowerCase());
export const CONTACT_ROLE_LABELS: Record<string, string> = { ATTORNEY: 'Attorney', TITLE_ESCROW: 'Title or escrow company' };
/** True when free text looks like it carries an account or routing number, which the contact notes must never hold. */
export const looksLikeBankDetails = (value: string) => /\d{8,}/.test(value.replace(/[\s-]/g, ''));

const blank = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]);
const date = z.preprocess(blank, exactDate.optional());
const text = (max: number) => z.preprocess(blank, z.string().trim().min(1).max(max).optional());
export const SETUP_SCHEMAS = {
  PATH_SET: z.object({ purchasePath: z.enum(['CASH', 'FINANCED']) }).strict(),
  INSPECTION_PLAN: z.object({
    scheduledDate: date, appointmentCompletedDate: date, reportDueDate: date, contingencyDueDate: date, accessNotes: text(4000), scopeNotes: text(4000),
    specialistScopes: z.preprocess(blank, z.array(z.enum(SPECIALIST_SCOPE_VALUES)).max(20).optional()), newQuestion: text(500),
    reinspectionRequired: z.preprocess(blank, z.enum(['YES', 'NO']).optional()), reinspectionScheduledDate: date, reinspectionCompletedDate: date,
  }).strict().refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Fill in at least one thing.' }),
  TITLE_CONTACT: z.object({
    role: z.enum(['ATTORNEY', 'TITLE_ESCROW']), name: z.string().trim().min(1).max(200), company: text(200),
    email: z.preprocess(blank, z.string().trim().email().max(320).optional()), phone: text(40), notes: text(2000),
  }).strict().refine((v) => !v.notes || !looksLikeBankDetails(v.notes), { message: 'Do not enter account or routing numbers.' }),
} as const;
export const parseSetupAnswer = (kind: SetupKind, answer: unknown) =>
  (SETUP_SCHEMAS[kind] as z.ZodType<Record<string, unknown>>).safeParse(answer);
