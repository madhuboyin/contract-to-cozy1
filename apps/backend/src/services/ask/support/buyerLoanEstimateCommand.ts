// The buyer's purchase Loan Estimates inside Ask (register P2 "Buyer Closing"; FRD v1.352). Pure: declared messages, action ids, forms and validation,
// mirroring BuyerPurchaseLoanEstimateService. A Loan Estimate figure is a draft until the buyer confirms every required figure against the document;
// selecting an offer is a planning record, and "intent to proceed" is a separate explicit note. Ask never applies, locks a rate or contacts a lender.
import { z } from 'zod';

export const LE_ENTITY_TYPE = 'BUYER_LOAN_ESTIMATE_REVISION';
export const LE_MESSAGES = {
  OFFER_ADD: 'Add a lender offer I received.',
  REVISION_START: 'Start a new Loan Estimate revision for this lender.',
  DRAFT_EDIT: 'Edit this Loan Estimate draft.',
  CONFIRM: 'Confirm this Loan Estimate against the document.',
  SELECT: 'Select this lender offer for my purchase.',
} as const;
export type LeKind = keyof typeof LE_MESSAGES;
export const LE_ACTION_IDS = {
  OFFER_ADD: 'buyer-le-offer-add', REVISION_START: 'buyer-le-revision-start', DRAFT_EDIT: 'buyer-le-draft-edit', CONFIRM: 'buyer-le-confirm', SELECT: 'buyer-le-select',
} as const;
export type LeFormKind = Exclude<LeKind, 'REVISION_START'>;
export const LE_CAPTURE_KEYS: Record<LeFormKind, string> = {
  OFFER_ADD: 'BUYER_LE_OFFER_ADD', DRAFT_EDIT: 'BUYER_LE_DRAFT_EDIT', CONFIRM: 'BUYER_LE_CONFIRM', SELECT: 'BUYER_LE_SELECT',
};
export const leKindFromMessage = (message: string): LeKind | null =>
  ((Object.entries(LE_MESSAGES) as Array<[LeKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const leFormKindFromCaptureKey = (key: string): LeFormKind | null =>
  ((Object.entries(LE_CAPTURE_KEYS) as Array<[LeFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

/** The nine figures the service requires before a revision can be confirmed, and the revision field each one reads. */
export const LE_FIELD_LABELS: Record<string, string> = {
  LOAN_AMOUNT: 'Loan amount', TERM: 'Loan term', LOAN_TYPE: 'Loan type', NOTE_RATE: 'Interest rate', APR: 'APR', PRINCIPAL_INTEREST: 'Monthly principal and interest',
  LOAN_COSTS: 'Loan costs', LENDER_CREDITS: 'Lender credits', CASH_TO_CLOSE: 'Cash to close',
};
export const LE_FIELD_VALUES: Record<string, string> = {
  LOAN_AMOUNT: 'loanAmountCents', TERM: 'loanTermMonths', LOAN_TYPE: 'loanType', NOTE_RATE: 'noteRateBps', APR: 'aprBps', PRINCIPAL_INTEREST: 'monthlyPrincipalAndInterestCents',
  LOAN_COSTS: 'loanCostsCents', LENDER_CREDITS: 'lenderCreditsCents', CASH_TO_CLOSE: 'cashToCloseCents',
};
export const LE_FIELD_KEYS = Object.keys(LE_FIELD_VALUES);
export const LOAN_TYPE_LABELS: Record<string, string> = { FIXED: 'Fixed rate', ARM: 'Adjustable rate', OTHER: 'Other' };
export const LOCK_STATUS_LABELS: Record<string, string> = { LOCKED: 'Locked', NOT_LOCKED: 'Not locked', UNKNOWN: 'Not sure' };
export const REVISION_STATUS_LABELS: Record<string, string> = { DRAFT: 'Draft', CONFIRMED: 'Confirmed', SUPERSEDED: 'Replaced' };
export const hasValue = (value: unknown) => value !== null && value !== undefined && value !== '';

const blank = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]);
const date = z.preprocess(blank, exactDate.optional());
const num = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v.replace(/[$,%\s]/g, '')) : v);
const money = z.preprocess(num, z.number().min(0).max(1_000_000_000).optional());
const positiveMoney = z.preprocess(num, z.number().gt(0).max(1_000_000_000).optional());
const percent = z.preprocess(num, z.number().min(0).max(50).optional());
const years = z.preprocess(num, z.number().min(1).max(50).optional());
const figures = {
  issuedDate: date, loanAmount: positiveMoney, termYears: years, loanType: z.preprocess(blank, z.enum(['FIXED', 'ARM', 'OTHER']).optional()), noteRate: percent, apr: percent,
  principalAndInterest: money, mortgageInsurance: money, monthlyPayment: money, loanCosts: money, lenderCredits: money, discountPointsPct: percent, discountPoints: money,
  prepaidAndEscrow: money, cashToClose: money, cashToCloseDirection: z.preprocess(blank, z.enum(['FROM_BORROWER', 'TO_BORROWER']).optional()),
  rateLockStatus: z.preprocess(blank, z.enum(['LOCKED', 'NOT_LOCKED', 'UNKNOWN']).optional()), rateLockExpirationDate: date,
};
export const LE_SCHEMAS = {
  OFFER_ADD: z.object({ lenderName: z.string().trim().min(1).max(200), ...figures }).strict(),
  DRAFT_EDIT: z.object(figures).strict().refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Fill in at least one thing.' }),
  CONFIRM: z.object({ fields: z.array(z.string()).max(LE_FIELD_KEYS.length) }).strict()
    .refine((v) => v.fields.every((f) => f in LE_FIELD_VALUES), { message: 'Unknown field.' })
    .refine((v) => LE_FIELD_KEYS.every((f) => v.fields.includes(f)), { message: 'Check every figure against the document.' }),
  SELECT: z.object({ intentToProceed: z.enum(['YES', 'NO']) }).strict(),
} as const;
export const parseLeAnswer = (kind: LeFormKind, answer: unknown) =>
  (LE_SCHEMAS[kind] as z.ZodType<Record<string, unknown>>).safeParse(answer);
