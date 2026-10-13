// Buyer-mode Negotiation Shield inside Ask (register P0 "Negotiation Shield", buyer mode; FRD v1.312). Pure: the declared messages and action ids, the
// two forms (start negotiating a finding; record the seller's response and the outcome) and their validation, and what an outcome does to the finding.
//
// Reached from the Buyer negotiation readiness answer's finding rows. A finding enters negotiation by being classified for seller negotiation on a
// confirmed inspection report (the Buyer Plan's own disposition); starting creates (or reuses) the buyer negotiation case; recording the outcome writes
// the seller response and outcome on that finding and, for some outcomes, resolves the finding and completes its Buyer Plan task.
import { z } from 'zod';

export const BUYER_FINDING_ENTITY_TYPE = 'BUYER_INSPECTION_FINDING';
export const BUYER_NEGOTIATION_MESSAGES = {
  START: 'Start negotiating this inspection finding with the seller.',
  OUTCOME: 'Record the seller response to this inspection finding.',
} as const;
export type BuyerNegotiationKind = keyof typeof BUYER_NEGOTIATION_MESSAGES;
export const BUYER_NEGOTIATION_ACTION_IDS = {
  START: 'buyer-negotiation-start',
  OUTCOME: 'buyer-negotiation-outcome',
} as const;
export const buyerNegotiationKindFromMessage = (message: string): BuyerNegotiationKind | null =>
  ((Object.entries(BUYER_NEGOTIATION_MESSAGES) as Array<[BuyerNegotiationKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;

export const BUYER_NEGOTIATION_CAPTURE_KEYS = { START: 'BUYER_NEGOTIATION_START', OUTCOME: 'BUYER_NEGOTIATION_OUTCOME' } as const;
export const buyerNegotiationKindFromCaptureKey = (key: string): BuyerNegotiationKind | null =>
  ((Object.entries(BUYER_NEGOTIATION_CAPTURE_KEYS) as Array<[BuyerNegotiationKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const BUYER_REQUEST_TYPES = ['REPAIR', 'CREDIT', 'REPAIR_OR_CREDIT'] as const;
export const BUYER_REQUEST_LABELS: Record<string, string> = { REPAIR: 'Ask the seller to repair it', CREDIT: 'Ask for a credit at closing', REPAIR_OR_CREDIT: 'Repair or a credit, whichever the seller prefers' };
export const BUYER_SELLER_RESPONSES = ['PENDING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'COUNTERED'] as const;
export const BUYER_SELLER_RESPONSE_LABELS: Record<string, string> = {
  PENDING: 'No response yet', ACCEPTED: 'Accepted', PARTIALLY_ACCEPTED: 'Partly accepted', REJECTED: 'Rejected', COUNTERED: 'Countered',
};
export const BUYER_OUTCOMES = ['PENDING', 'ACCEPTED_REPAIR', 'ACCEPTED_CREDIT', 'SELLER_REPAIRED', 'REJECTED', 'TRANSFERRED_TO_BUYER'] as const;
export const BUYER_OUTCOME_LABELS: Record<string, string> = {
  PENDING: 'Not settled yet', ACCEPTED_REPAIR: 'Seller agreed to repair', ACCEPTED_CREDIT: 'Seller agreed to a credit', SELLER_REPAIRED: 'Seller completed the repair',
  REJECTED: 'Seller declined', TRANSFERRED_TO_BUYER: 'I will handle it after closing',
};

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable()).optional();
const dollars = z.preprocess(blank, z.coerce.number().nonnegative().max(10_000_000).nullable()).optional();

export const BuyerStartInputSchema = z.object({
  requestType: z.enum(BUYER_REQUEST_TYPES),
  requestedCredit: dollars,
  notes: text(4000),
}).strict();
export const BuyerOutcomeInputSchema = z.object({
  sellerResponse: z.enum(BUYER_SELLER_RESPONSES),
  sellerResponseNotes: text(4000),
  outcome: z.enum(BUYER_OUTCOMES),
  agreedCredit: dollars,
  outcomeNotes: text(4000),
}).strict();

export interface BuyerStartInput { requestType: (typeof BUYER_REQUEST_TYPES)[number]; requestedCreditCents: number | null; notes: string | null }
export interface BuyerOutcomeInput {
  sellerResponse: (typeof BUYER_SELLER_RESPONSES)[number]; sellerResponseNotes: string | null;
  outcome: (typeof BUYER_OUTCOMES)[number]; agreedCreditCents: number | null; outcomeNotes: string | null;
}
export type BuyerNegotiationFormData = BuyerStartInput | BuyerOutcomeInput;

const cents = (value: number | null | undefined) => (value === null || value === undefined ? null : Math.round(value * 100));

export function parseBuyerNegotiationAnswer(kind: BuyerNegotiationKind, answer: unknown):
  { success: true; data: BuyerNegotiationFormData } | { success: false; reason: 'INVALID' | 'CREDIT_REQUIRED' } {
  if (kind === 'START') {
    const parsed = BuyerStartInputSchema.safeParse(answer);
    if (!parsed.success) return { success: false, reason: 'INVALID' };
    return { success: true, data: { requestType: parsed.data.requestType, requestedCreditCents: cents(parsed.data.requestedCredit as number | null | undefined), notes: (parsed.data.notes ?? null) as string | null } };
  }
  const parsed = BuyerOutcomeInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const agreedCreditCents = cents(parsed.data.agreedCredit as number | null | undefined);
  // The canonical schema requires the agreed credit for an accepted credit.
  if (parsed.data.outcome === 'ACCEPTED_CREDIT' && agreedCreditCents === null) return { success: false, reason: 'CREDIT_REQUIRED' };
  return {
    success: true,
    data: {
      sellerResponse: parsed.data.sellerResponse, sellerResponseNotes: (parsed.data.sellerResponseNotes ?? null) as string | null,
      outcome: parsed.data.outcome, agreedCreditCents, outcomeNotes: (parsed.data.outcomeNotes ?? null) as string | null,
    },
  };
}

/** What recording an outcome does beyond saving it, in the homeowner's words, so the review card states it before anything is written. */
export function buyerOutcomeConsequence(outcome: string, hasBuyerTask: boolean): string | null {
  const task = hasBuyerTask ? ' and its Buyer Plan task is marked complete' : '';
  if (outcome === 'ACCEPTED_CREDIT') return `The finding is marked resolved as credited at closing${task}.`;
  if (outcome === 'SELLER_REPAIRED') return `The finding is marked resolved as repaired by the seller${task}.`;
  if (outcome === 'TRANSFERRED_TO_BUYER') return 'The finding becomes your post-closing work and is reopened.';
  return null;
}
