// The sale case itself inside Ask (register P2 "Seller Prep"; FRD v1.338). Pure: declared messages, action ids, the forms and validation, and the legal next
// statuses (the service's own order, mirrored so the form only offers what the service would accept).
//
// Item decisions (waive, pursue, reopen) already exist. What the page also lets a household do to the case is start it, set its target dates and its prep
// budget range, and move it through listed, under contract and closed (or cancel it). Notable-upgrades confirmation (v1.443) is a fourth form here; the ownership transition and buyer-package hand-off (v1.444) are three more kinds.
import { z } from 'zod';

export const SALE_CASE_ENTITY_TYPE = 'SELLER_PREP_CASE';
export const SALE_CASE_MESSAGES = {
  START: 'Start a sale case for this home.',
  DATES: 'Set the target dates for this sale.',
  BUDGET: 'Set the prep budget range for this sale.',
  STATUS: 'Move this sale to its next stage.',
  UPGRADES: 'Confirm the notable upgrades for this sale.',
  TRANSITION_START: 'Start the ownership transition for this sale.',
  TRANSITION: 'Set the buyer package and retention decision for this ownership transition.',
  COMPLETE: 'Complete the ownership transition for this sale.',
} as const;
export type SaleCaseKind = keyof typeof SALE_CASE_MESSAGES;
export const SALE_CASE_ACTION_IDS = { START: 'seller-prep-case-start', DATES: 'seller-prep-case-dates', BUDGET: 'seller-prep-case-budget', STATUS: 'seller-prep-case-status', UPGRADES: 'seller-prep-case-upgrades',
  TRANSITION_START: 'seller-prep-transition-start', TRANSITION: 'seller-prep-transition-details', COMPLETE: 'seller-prep-transition-complete' } as const;
export const saleCaseKindFromMessage = (message: string): SaleCaseKind | null =>
  ((Object.entries(SALE_CASE_MESSAGES) as Array<[SaleCaseKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export type SaleCaseFormKind = 'DATES' | 'BUDGET' | 'STATUS' | 'UPGRADES' | 'TRANSITION' | 'COMPLETE';
/** The ownership-transition kinds (FRD v1.444): handled by sellerPrepTransition.handler, under the same declared command. */
export const SALE_TRANSITION_KINDS = ['TRANSITION_START', 'TRANSITION', 'COMPLETE'] as const;
export const isSaleTransitionKind = (kind: string): kind is (typeof SALE_TRANSITION_KINDS)[number] => (SALE_TRANSITION_KINDS as readonly string[]).includes(kind);
export const SALE_CASE_FORM_CAPTURE_KEYS: Record<SaleCaseFormKind, string> = { DATES: 'SELLER_PREP_CASE_DATES', BUDGET: 'SELLER_PREP_CASE_BUDGET', STATUS: 'SELLER_PREP_CASE_STATUS', UPGRADES: 'SELLER_PREP_CASE_UPGRADES', TRANSITION: 'SELLER_PREP_TRANSITION_DETAILS', COMPLETE: 'SELLER_PREP_TRANSITION_COMPLETE' };
export const saleCaseFormKindFromCaptureKey = (key: string): SaleCaseFormKind | null =>
  ((Object.entries(SALE_CASE_FORM_CAPTURE_KEYS) as Array<[SaleCaseFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const BUDGET_RANGES = ['UNDER_5K', 'FIVE_TO_15K', 'FIFTEEN_TO_30K', 'OVER_30K'] as const;
export const BUDGET_RANGE_LABELS: Record<string, string> = { UNDER_5K: 'Under $5,000', FIVE_TO_15K: '$5,000 to $15,000', FIFTEEN_TO_30K: '$15,000 to $30,000', OVER_30K: 'Over $30,000', NONE: 'No range set' };
export const SALE_STATUS_LABELS: Record<string, string> = { PREPARING: 'Preparing', LISTED: 'Listed', UNDER_CONTRACT: 'Under contract', CLOSED: 'Closed', CANCELLED: 'Cancelled' };

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
const optionalDate = z.preprocess(blank, exactDate.nullable()).optional();
export const SaleCaseDatesSchema = z.object({ targetListDate: optionalDate, targetCloseDate: optionalDate }).strict();
export const SaleCaseBudgetSchema = z.object({ budgetRange: z.enum([...BUDGET_RANGES, 'NONE']) }).strict();
export const SaleCaseStatusSchema = z.object({ status: z.enum(['LISTED', 'UNDER_CONTRACT', 'CLOSED', 'CANCELLED']) }).strict();
/** The upgrades to confirm as `TYPE:id` keys, the page's own shape; an empty list (nothing ticked) is a real answer. */
export const SaleCaseUpgradesSchema = z.object({ upgrades: z.array(z.string().trim().min(1).max(120)).max(50).default([]) }).strict();
/** A blank keeps the saved value; `NONE` on the package unlinks it. Notes can be replaced but not cleared here (a blank is indistinguishable from "left as is"). */
export const SALE_TRANSITION_NO_PACKAGE = 'NONE';
export const RETENTION_DECISION_LABELS: Record<string, string> = { RETAIN_PRIVATE_ONLY: 'Keep the history private', SHARE_SELECTED_HISTORY: 'Share selected history with the buyer' };
export const SaleTransitionDetailsSchema = z.object({
  buyerPackageId: z.preprocess(blank, z.string().trim().min(1).max(100).nullable()).optional(),
  sellerRetentionDecision: z.preprocess(blank, z.enum(['RETAIN_PRIVATE_ONLY', 'SHARE_SELECTED_HISTORY']).nullable()).optional(),
  sellerRetentionNotes: z.preprocess(blank, z.string().trim().max(1000).nullable()).optional(),
}).strict();
export const SaleTransitionCompleteSchema = z.object({ revokeShareIds: z.array(z.string().trim().min(1).max(100)).max(20).default([]) }).strict();
export const SALE_CASE_FORM_SCHEMAS = { DATES: SaleCaseDatesSchema, BUDGET: SaleCaseBudgetSchema, STATUS: SaleCaseStatusSchema, UPGRADES: SaleCaseUpgradesSchema, TRANSITION: SaleTransitionDetailsSchema, COMPLETE: SaleTransitionCompleteSchema } as const;

export function parseSaleCaseAnswer(kind: SaleCaseFormKind, answer: unknown): { success: true; data: Record<string, unknown> } | { success: false; reason: 'INVALID' | 'NOTHING' | 'ORDER' } {
  const parsed = (SALE_CASE_FORM_SCHEMAS[kind] as z.ZodType).safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const data = Object.fromEntries(Object.entries(parsed.data as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined));
  if (kind === 'DATES') {
    if (!Object.keys(data).length) return { success: false, reason: 'NOTHING' };
    if (typeof data.targetListDate === 'string' && typeof data.targetCloseDate === 'string' && data.targetCloseDate < data.targetListDate) return { success: false, reason: 'ORDER' };
  }
  return { success: true, data };
}
/** The statuses the service accepts from `current`: the next one forward, or cancelling while the sale is not over. */
export function legalNextStatuses(current: string): Array<'LISTED' | 'UNDER_CONTRACT' | 'CLOSED' | 'CANCELLED'> {
  const order = ['PREPARING', 'LISTED', 'UNDER_CONTRACT', 'CLOSED'] as const;
  const i = order.indexOf(current as (typeof order)[number]);
  const out: Array<'LISTED' | 'UNDER_CONTRACT' | 'CLOSED' | 'CANCELLED'> = [];
  if (i >= 0 && i + 1 < order.length) out.push(order[i + 1] as 'LISTED' | 'UNDER_CONTRACT' | 'CLOSED');
  if (current !== 'CLOSED' && current !== 'CANCELLED') out.push('CANCELLED');
  return out;
}
