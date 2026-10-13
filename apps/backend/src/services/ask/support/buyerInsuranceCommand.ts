// The buyer's homeowners insurance for closing inside Ask (register P2 "Buyer Closing"; FRD v1.348). Pure: declared messages, action ids, forms and
// validation, mirroring BuyerInsuranceService. Ask records what the buyer did with their insurer; it does not buy, bind or cancel coverage, and
// recording a binding creates the policy record only after the buyer confirms they bound it.
import { z } from 'zod';

export const INSURANCE_ENTITY_TYPES = { QUOTE: 'BUYER_INSURANCE_QUOTE', REQUIREMENT: 'BUYER_INSURANCE_REQUIREMENT' } as const;
export const INSURANCE_MESSAGES = {
  REQUIREMENT_ADD: 'Add an insurance requirement for my closing.',
  REQUIREMENT_UPDATE: 'Update where this insurance requirement stands.',
  QUOTE_ADD: 'Record an insurance quote I received.',
  QUOTE_SELECT: 'Choose this insurance quote.',
  BIND: 'Record that my insurance was bound.',
  PROOF: 'Update the insurance proof for my lender and closing.',
} as const;
export type InsuranceKind = keyof typeof INSURANCE_MESSAGES;
export const INSURANCE_ACTION_IDS = {
  REQUIREMENT_ADD: 'buyer-insurance-requirement-add', REQUIREMENT_UPDATE: 'buyer-insurance-requirement-update', QUOTE_ADD: 'buyer-insurance-quote-add',
  QUOTE_SELECT: 'buyer-insurance-quote-select', BIND: 'buyer-insurance-bind', PROOF: 'buyer-insurance-proof',
} as const;
export type InsuranceFormKind = Exclude<InsuranceKind, 'QUOTE_SELECT'>;
export const INSURANCE_CAPTURE_KEYS: Record<InsuranceFormKind, string> = {
  REQUIREMENT_ADD: 'BUYER_INSURANCE_REQUIREMENT_ADD', REQUIREMENT_UPDATE: 'BUYER_INSURANCE_REQUIREMENT_UPDATE', QUOTE_ADD: 'BUYER_INSURANCE_QUOTE_ADD',
  BIND: 'BUYER_INSURANCE_BIND', PROOF: 'BUYER_INSURANCE_PROOF',
};
export const insuranceKindFromMessage = (message: string): InsuranceKind | null =>
  ((Object.entries(INSURANCE_MESSAGES) as Array<[InsuranceKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const insuranceFormKindFromCaptureKey = (key: string): InsuranceFormKind | null =>
  ((Object.entries(INSURANCE_CAPTURE_KEYS) as Array<[InsuranceFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const REQUIREMENT_CATEGORIES = [
  ['PROPERTY_CONDITION', 'Property condition'], ['ROOF', 'Roof'], ['ELECTRICAL', 'Electrical'], ['PLUMBING', 'Plumbing'], ['PRIOR_LOSS', 'Prior loss history'],
  ['LENDER', 'Lender requirement'], ['OTHER', 'Other'],
] as const;
export const REQUIREMENT_STATUS_LABELS: Record<string, string> = { OPEN: 'Open', SUBMITTED: 'Submitted', RESOLVED: 'Resolved', WAIVED: 'Set aside' };
export const QUOTE_STATUS_LABELS: Record<string, string> = { DRAFT: 'Recorded', REVIEWED: 'Reviewed', SELECTED: 'Chosen', DECLINED: 'Declined' };
export const PROOF_LABELS: Record<string, string> = { NOT_REQUIRED: 'Not required', PENDING: 'Pending', DELIVERED: 'Delivered' };

const blank = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]);
const date = z.preprocess(blank, exactDate.optional());
const requiredDate = exactDate;
const text = z.preprocess(blank, z.string().trim().max(2000).optional());
const money = z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : v), z.number().min(0).max(100_000_000).optional());
const proof = z.preprocess(blank, z.enum(['NOT_REQUIRED', 'PENDING', 'DELIVERED']).optional());
export const INSURANCE_SCHEMAS = {
  REQUIREMENT_ADD: z.object({
    category: z.enum(REQUIREMENT_CATEGORIES.map((c) => c[0]) as [string, ...string[]]), title: z.string().trim().min(1).max(200), notes: text, dueDate: date, blocking: z.enum(['YES', 'NO']),
  }).strict(),
  REQUIREMENT_UPDATE: z.object({ status: z.enum(['OPEN', 'SUBMITTED', 'RESOLVED', 'WAIVED']), notes: text }).strict(),
  QUOTE_ADD: z.object({ carrierName: z.string().trim().min(1).max(200), annualPremium: money, deductible: money, validUntilDate: date, exclusionsNotes: text }).strict(),
  BIND: z.object({ policyNumber: z.string().trim().min(1).max(160), effectiveDate: requiredDate, expiresDate: requiredDate })
    .strict().refine((v) => v.expiresDate > v.effectiveDate, { message: 'Policy expiration must be after its effective date.' }),
  PROOF: z.object({ lenderProofStatus: proof, closingProofStatus: proof }).strict().refine((v) => v.lenderProofStatus !== undefined || v.closingProofStatus !== undefined, { message: 'Choose at least one.' }),
} as const;
export const parseInsuranceAnswer = (kind: InsuranceFormKind, answer: unknown) =>
  (INSURANCE_SCHEMAS[kind] as z.ZodType<Record<string, string | number | undefined>>).safeParse(answer);
export const requirementUpdatable = (status: string) => status === 'OPEN' || status === 'SUBMITTED';
export const quoteSelectable = (status: string) => status === 'DRAFT' || status === 'REVIEWED';
/** What the service would refuse a binding for, in its own order, or null when it would accept. */
export function bindBlocker(workspace: { selectedQuoteId: string | null; boundPolicyId: string | null }, quote: { id: string; status: string; annualPremiumCents: number | null; validUntil: string | null } | null, now: Date): string | null {
  if (workspace.boundPolicyId) return 'A bound policy is already recorded.';
  if (!quote || workspace.selectedQuoteId !== quote.id || quote.status !== 'SELECTED') return 'Choose the quote you bound first.';
  if (quote.annualPremiumCents == null) return 'Add the annual premium to that quote before recording the binding.';
  if (quote.validUntil && new Date(quote.validUntil) < now) return 'The chosen quote has expired. Record a current quote and choose it.';
  return null;
}
