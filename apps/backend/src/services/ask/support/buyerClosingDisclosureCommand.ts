// The buyer's Closing Disclosure revisions and funds readiness inside Ask (register P2 "Buyer Closing"; FRD v1.351). Pure: declared messages, action ids,
// forms and validation, mirroring BuyerClosingDisclosureService.
//
// Wire-fraud sensitive. A revision is a draft until the buyer confirms it figure by figure against the document; Ask offers no blanket confirm. Funds
// readiness needs a draft first. Ask never tells anyone to close and never asks the buyer to trust emailed wire instructions, and it never stores or
// accepts account, routing or wire credentials.
import { z } from 'zod';

export const CD_MESSAGES = {
  DRAFT_START: 'Start a revision of my Closing Disclosure.',
  DRAFT_EDIT: 'Edit my Closing Disclosure draft.',
  CONFIRM: 'Confirm my Closing Disclosure figures against the document.',
  FUNDS_UPDATE: 'Update my closing funds readiness.',
} as const;
export type CdKind = keyof typeof CD_MESSAGES;
export const CD_ACTION_IDS = {
  DRAFT_START: 'buyer-cd-draft-start', DRAFT_EDIT: 'buyer-cd-draft-edit', CONFIRM: 'buyer-cd-confirm', FUNDS_UPDATE: 'buyer-cd-funds-update',
} as const;
export type CdFormKind = Exclude<CdKind, 'DRAFT_START'>;
export const CD_CAPTURE_KEYS: Record<CdFormKind, string> = {
  DRAFT_EDIT: 'BUYER_CD_DRAFT_EDIT', CONFIRM: 'BUYER_CD_CONFIRM', FUNDS_UPDATE: 'BUYER_CD_FUNDS_UPDATE',
};
export const cdKindFromMessage = (message: string): CdKind | null =>
  ((Object.entries(CD_MESSAGES) as Array<[CdKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const cdFormKindFromCaptureKey = (key: string): CdFormKind | null =>
  ((Object.entries(CD_CAPTURE_KEYS) as Array<[CdFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

/** The ten figures the service requires before a revision can be confirmed, and the revision field each one reads. */
export const CD_FIELD_LABELS: Record<string, string> = {
  ISSUED_DATE: 'Issued date', LOAN_AMOUNT: 'Loan amount', NOTE_RATE: 'Interest rate', APR: 'APR', MONTHLY_PAYMENT: 'Estimated total monthly payment',
  LOAN_COSTS: 'Loan costs', LENDER_CREDITS: 'Lender credits', PREPAID_ESCROW: 'Prepaids and escrow', SELLER_CREDITS: 'Seller credits', CASH_TO_CLOSE: 'Cash to close',
};
export const CD_FIELD_VALUES: Record<string, string> = {
  ISSUED_DATE: 'issuedDate', LOAN_AMOUNT: 'loanAmountCents', NOTE_RATE: 'noteRateBps', APR: 'aprBps', MONTHLY_PAYMENT: 'estimatedTotalMonthlyPaymentCents',
  LOAN_COSTS: 'loanCostsCents', LENDER_CREDITS: 'lenderCreditsCents', PREPAID_ESCROW: 'prepaidAndEscrowCents', SELLER_CREDITS: 'sellerCreditsCents', CASH_TO_CLOSE: 'cashToCloseCents',
};
export const CD_FIELD_KEYS = Object.keys(CD_FIELD_VALUES);
export const FUNDS_METHOD_LABELS: Record<string, string> = { UNKNOWN: 'Not decided', WIRE: 'Wire', CASHIERS_CHECK: 'Cashier’s check', OTHER: 'Other' };
export const VERIFICATION_CHANNEL_LABELS: Record<string, string> = {
  UNKNOWN: 'Not verified yet', KNOWN_PHONE: 'Called a phone number I already knew', IN_PERSON: 'In person', SECURE_PORTAL: 'The closing company’s secure portal', OTHER: 'Another trusted channel',
};
/** Said on every funds review and on the confirmation card: the safeguard is not optional text. */
export const WIRE_SAFETY_TEXT = 'Ask never tells anyone to close and never asks you to trust emailed wire instructions. Verify instructions yourself by calling a number you already know, in person, or in the closing company’s secure portal. Do not enter account or routing numbers here; none are stored.';
/** True when free text looks like it carries an account or routing number. */
export const looksLikeBankDetails = (value: string) => /\d{8,}/.test(value.replace(/[\s-]/g, ''));

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
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const yesNo = z.preprocess(blank, z.enum(['YES', 'NO']).optional());
export const CD_SCHEMAS = {
  DRAFT_EDIT: z.object({
    issuedDate: date, loanAmount: positiveMoney, noteRate: percent, apr: percent, monthlyPayment: money, loanCosts: money, lenderCredits: money,
    prepaidAndEscrow: money, sellerCredits: money, cashToClose: money, cashToCloseDirection: z.preprocess(blank, z.enum(['FROM_BORROWER', 'TO_BORROWER']).optional()),
    changeExplanation: text(4000),
  }).strict().refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Fill in at least one thing.' }),
  CONFIRM: z.object({ fields: z.array(z.string()).max(CD_FIELD_KEYS.length) }).strict()
    .refine((v) => v.fields.every((f) => f in CD_FIELD_VALUES), { message: 'Unknown field.' })
    .refine((v) => CD_FIELD_KEYS.every((f) => v.fields.includes(f)), { message: 'Check every figure against the document.' }),
  FUNDS_UPDATE: z.object({
    fundsMethod: z.preprocess(blank, z.enum(['UNKNOWN', 'WIRE', 'CASHIERS_CHECK', 'OTHER']).optional()),
    fundsExpectedDate: date,
    fundsReady: yesNo,
    verificationChannel: z.preprocess(blank, z.enum(['UNKNOWN', 'KNOWN_PHONE', 'IN_PERSON', 'SECURE_PORTAL', 'OTHER']).optional()),
    instructionsVerified: yesNo,
    questionsResolved: yesNo,
    newQuestion: text(500),
  }).strict()
    .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Fill in at least one thing.' })
    .refine((v) => !v.newQuestion || !looksLikeBankDetails(v.newQuestion), { message: 'Do not enter account or routing numbers.' }),
} as const;
export const parseCdAnswer = (kind: CdFormKind, answer: unknown) =>
  (CD_SCHEMAS[kind] as z.ZodType<Record<string, unknown>>).safeParse(answer);
