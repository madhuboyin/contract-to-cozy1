// Attaching an existing Home Record to a Negotiation Shield review inside Ask (ASK_COZY_NEGOTIATION_SHIELD_DOCUMENTS_DESIGN.md, slice 3a). Pure: the
// document roles each scenario counts, which records may be offered, and the answer validation. Strings and rules only, so the review, the handler, the
// capture path and the tests share one definition.
import { z } from 'zod';
import type { NegotiationStartScenario } from './negotiationShieldStart';

export const NEGOTIATION_SHIELD_ATTACH_MESSAGE = 'Attach a document to this negotiation review.';
export const NEGOTIATION_SHIELD_ATTACH_CAPTURE_KEY = 'NEGOTIATION_SHIELD_ATTACH_INPUTS';
/** The "Attach a document" action on a review's Documents block. */
export const NEGOTIATION_SHIELD_ATTACH_ACTION_ID = 'negotiation-shield-attach';
/** How many records the form offers (the most recently added first). */
export const NEGOTIATION_ATTACH_MAX_OPTIONS = 25;

export const NEGOTIATION_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  QUOTE: 'Quote',
  CONTRACTOR_ESTIMATE: 'Contractor estimate',
  CONTRACTOR_RECOMMENDATION: 'Contractor recommendation',
  PREMIUM_NOTICE: 'Premium notice',
  CLAIM_SETTLEMENT_NOTICE: 'Settlement notice',
  CLAIM_ESTIMATE: 'Repair estimate',
  INSPECTION_REPORT: 'Inspection report',
  BUYER_REQUEST: 'Buyer request',
  SUPPORTING_DOCUMENT: 'Supporting document',
};

/** The roles a document can play in each review: exactly the ones that scenario's rules engine counts (design G3). Buyer inspection arrives with buyer mode. */
export const NEGOTIATION_ATTACH_DOCUMENT_TYPES: Record<NegotiationStartScenario, readonly string[]> = {
  CONTRACTOR_QUOTE_REVIEW: ['QUOTE', 'SUPPORTING_DOCUMENT'],
  INSURANCE_PREMIUM_INCREASE: ['PREMIUM_NOTICE', 'SUPPORTING_DOCUMENT'],
  INSURANCE_CLAIM_SETTLEMENT: ['CLAIM_SETTLEMENT_NOTICE', 'CLAIM_ESTIMATE', 'SUPPORTING_DOCUMENT'],
  CONTRACTOR_URGENCY_PRESSURE: ['CONTRACTOR_RECOMMENDATION', 'CONTRACTOR_ESTIMATE', 'SUPPORTING_DOCUMENT'],
};

/**
 * Design D-A2: a price negotiation does not call for a personal, security or legal record, and those carry the most exposure. They are not offered, and
 * are refused at confirmation if one is forged. (The page classifies every upload STANDARD, so an unrelated sensitive record is the real risk.)
 */
export const NEGOTIATION_ATTACH_ALLOWED_SENSITIVITIES: ReadonlySet<string> = new Set(['STANDARD', 'FINANCIAL', 'INSURANCE', 'CLAIM']);

export interface NegotiationAttachCandidate {
  id: string; title: string; kind: string; kindLabel: string; addedAt: Date; sensitivity: string | null; visibility: string | null; lifecycle: string | null;
}

/**
 * The records the form may offer: active, visible to the whole household (a review is shared; design D-A1), of an allowed sensitivity, and not already
 * attached. Newest first, bounded. The counts say why some were left out without naming them.
 */
export function offerableNegotiationDocuments(candidates: readonly NegotiationAttachCandidate[], alreadyAttachedRecordIds: ReadonlySet<string>): {
  options: NegotiationAttachCandidate[]; excludedPrivate: number; excludedSensitive: number;
} {
  let excludedPrivate = 0;
  let excludedSensitive = 0;
  const options: NegotiationAttachCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.lifecycle === 'ARCHIVED' || alreadyAttachedRecordIds.has(candidate.id)) continue;
    if (candidate.visibility !== 'HOUSEHOLD') { excludedPrivate += 1; continue; }
    if (!candidate.sensitivity || !NEGOTIATION_ATTACH_ALLOWED_SENSITIVITIES.has(candidate.sensitivity)) { excludedSensitive += 1; continue; }
    options.push(candidate);
  }
  options.sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime());
  return { options: options.slice(0, NEGOTIATION_ATTACH_MAX_OPTIONS), excludedPrivate, excludedSensitive };
}

export function negotiationAttachAnswerSchema(scenario: NegotiationStartScenario) {
  const types = NEGOTIATION_ATTACH_DOCUMENT_TYPES[scenario] as readonly [string, ...string[]];
  return z.object({
    documentType: z.enum(types),
    recordId: z.string().trim().min(1).max(160),
  }).strict();
}

export function parseNegotiationAttachAnswer(scenario: NegotiationStartScenario, answer: unknown):
  { success: true; data: { documentType: string; recordId: string } } | { success: false } {
  const parsed = negotiationAttachAnswerSchema(scenario).safeParse(answer);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}
