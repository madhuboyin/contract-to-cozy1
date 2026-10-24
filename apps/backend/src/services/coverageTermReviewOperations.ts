// A homeowner's review of the policy or warranty terms that are current, and what it proves to a guided journey (continuation FRD section 39).
//
// Opening the coverage tool or reading a transient answer proves nothing. A review is an append-only record that a person reviewed THESE terms: the fingerprint covers each current
// term's identity and dates, so a term that changes needs a new review. The Desktop route and Ask call `reviewCoverageTermsWithEffects`, so neither can report the step with weaker proof.

import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolveGuidanceStepBinding, type GuidanceStepBinding, type GuidanceStepBindingResult } from './guidanceEngine/guidanceStepBinding';

export const COVERAGE_REVIEW_TOOL_KEY = 'coverage-intelligence';
export const COVERAGE_TERM_KINDS = ['POLICY', 'WARRANTY'] as const;
export type CoverageTermKind = (typeof COVERAGE_TERM_KINDS)[number];
export const COVERAGE_TERM_STEP_KEY: Record<CoverageTermKind, string> = { POLICY: 'review_current_policy_context', WARRANTY: 'review_current_warranty_context' };

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : '');

/** The current terms in scope and a stable fingerprint over them. Policies are the property's; warranties are the item's, or the property's and its items' when no item is named. */
export async function currentCoverageTerms(propertyId: string, kind: CoverageTermKind, inventoryItemId: string | null): Promise<{ count: number; fingerprint: string; labels: string[] }> {
  const now = new Date();
  let parts: string[];
  let labels: string[];
  if (kind === 'POLICY') {
    const rows = await prisma.insurancePolicy.findMany({ where: { propertyId, OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] }, orderBy: { id: 'asc' } });
    labels = rows.map((row: any) => `${row.carrierName}${row.coverageType ? ` (${row.coverageType})` : ''}`);
    parts = rows.map((row: any) => [row.id, row.carrierName, row.policyNumber, row.coverageType, iso(row.startDate), iso(row.expiryDate), row.deductibleCents ?? '', iso(row.updatedAt)].join(':'));
  } else {
    const scope = inventoryItemId ? { inventoryItemId } : { OR: [{ propertyId }, { inventoryItem: { propertyId } }] };
    const rows = await prisma.warranty.findMany({ where: { ...scope, expiryDate: { gte: now } }, orderBy: { id: 'asc' } });
    labels = rows.map((row: any) => `${row.providerName}, expires ${iso(row.expiryDate).slice(0, 10)}`);
    parts = rows.map((row: any) => [row.id, row.providerName, row.inventoryItemId ?? '', iso(row.startDate), iso(row.expiryDate), iso(row.updatedAt)].join(':'));
  }
  return { count: parts.length, fingerprint: createHash('sha256').update(parts.join('|')).digest('hex'), labels };
}

/** Whether a step may be completed by reviewing this kind of term: the coverage tool's open review step of that kind, and the journey's item is the scope being reviewed. Re-read each time. */
export async function resolveCoverageTermBinding(propertyId: string, stepId: string, kind: CoverageTermKind, inventoryItemId: string | null): Promise<GuidanceStepBindingResult> {
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: COVERAGE_REVIEW_TOOL_KEY, stepKeys: [COVERAGE_TERM_STEP_KEY[kind]] });
  if (!bound.ok) return bound;
  return bound.binding.inventoryItemId === inventoryItemId ? bound : { ok: false, reason: 'WRONG_SUBJECT' };
}

export function buildCoverageTermReviewCompletion(propertyId: string, actorUserId: string, review: { id: string; termKind: string; termFingerprint: string; termCount: number; reviewedAt: Date }, binding: GuidanceStepBinding) {
  return {
    propertyId, actorUserId, journeyId: binding.journeyId, inventoryItemId: binding.inventoryItemId, signalIntentFamily: binding.signalIntentFamily ?? 'coverage_gap_or_uncertainty', issueDomain: 'FINANCIAL' as const,
    sourceToolKey: COVERAGE_REVIEW_TOOL_KEY, sourceEntityType: 'COVERAGE_TERM_REVIEW', sourceEntityId: review.id, stepKey: binding.stepKey, status: 'COMPLETED' as const,
    dedupeKey: `coverage-term-review:${propertyId}:${review.id}:${binding.stepKey}`,
    producedData: { proofType: 'coverage_term_review', proofId: review.id, reviewId: review.id, termKind: review.termKind, termFingerprint: review.termFingerprint, termCount: review.termCount, reviewedAt: review.reviewedAt.toISOString(), reviewedByUserId: actorUserId },
  };
}

export type ReviewTermsResult = { review: any; reused: boolean; guidanceReported: boolean | null; guidanceRefusal: string | null };

/**
 * Records the review of the current terms (append-only; the same person reviewing the same terms for the same step returns the earlier row), then reports it to the step it was started for, if one was named.
 * With no current term there is nothing to review. The scope item comes from the journey step when one is named, never from the caller. A refused step reports nothing and no other step is used.
 */
export async function reviewCoverageTermsWithEffects(
  propertyId: string, userId: string, kind: CoverageTermKind, options: { guidanceStepId?: string | null; inventoryItemId?: string | null; expectedFingerprint?: string | null } = {},
): Promise<ReviewTermsResult> {
  if (!COVERAGE_TERM_KINDS.includes(kind)) throw new APIError('Unknown coverage term kind.', 400, 'COVERAGE_TERM_KIND_INVALID');
  // The step is read first: a review started from a journey step reviews the scope that journey is about.
  let scopeItemId = options.inventoryItemId ?? null;
  if (options.guidanceStepId) {
    const peek = await resolveGuidanceStepBinding(propertyId, options.guidanceStepId, { toolKey: COVERAGE_REVIEW_TOOL_KEY, stepKeys: [COVERAGE_TERM_STEP_KEY[kind]] });
    if (peek.ok) scopeItemId = peek.binding.inventoryItemId;
  }
  const current = await currentCoverageTerms(propertyId, kind, scopeItemId);
  if (current.count === 0) throw new APIError(kind === 'POLICY' ? 'No current insurance policy is recorded to review.' : 'No current warranty is recorded to review.', 409, 'COVERAGE_TERMS_NONE');
  if (options.expectedFingerprint && options.expectedFingerprint !== current.fingerprint) throw new APIError('These terms changed after they were shown. Review them again.', 409, 'COVERAGE_TERMS_CHANGED');
  const bound = options.guidanceStepId ? await resolveCoverageTermBinding(propertyId, options.guidanceStepId, kind, scopeItemId) : null;
  const lineage = bound?.ok ? { journeyId: bound.binding.journeyId, stepId: options.guidanceStepId! } : { journeyId: null, stepId: null };
  const earlier = await prisma.coverageTermReview.findFirst({ where: { propertyId, termKind: kind, inventoryItemId: scopeItemId, termFingerprint: current.fingerprint, reviewedByUserId: userId, ...lineage }, orderBy: { reviewedAt: 'desc' } });
  const review = earlier ?? await prisma.coverageTermReview.create({
    data: { propertyId, termKind: kind, inventoryItemId: scopeItemId, termFingerprint: current.fingerprint, termCount: current.count, reviewedByUserId: userId, ...lineage },
  });
  if (!bound) return { review, reused: Boolean(earlier), guidanceReported: null, guidanceRefusal: null };
  if (!bound.ok) return { review, reused: Boolean(earlier), guidanceReported: false, guidanceRefusal: bound.reason };
  try {
    await guidanceJourneyService.recordToolCompletion(buildCoverageTermReviewCompletion(propertyId, userId, review, bound.binding));
    return { review, reused: Boolean(earlier), guidanceReported: true, guidanceRefusal: null };
  } catch (guidanceError) {
    logger.warn({ guidanceError, reviewId: review.id }, '[GUIDANCE] coverage term review completion report failed');
    return { review, reused: Boolean(earlier), guidanceReported: false, guidanceRefusal: null };
  }
}
