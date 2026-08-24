/**
 * Home Intelligence Functional Completeness FRD §8.7 (HI-DOC-003) — the
 * code-owned registry of canonical promotion adapters, one row per target
 * domain HI-DOC-003 names. Phase 5 work item 3.
 *
 * Declarative, like every sibling registry in this directory (commandOwner,
 * completionAdapterOwner, producerId, etc.) — a row documents a real
 * function elsewhere, it does not carry a stored callback. See
 * compoundRuleRegistry.contract.ts's header for why.
 */

export const DOCUMENT_PROMOTION_TARGET_DOMAINS = [
  'INVENTORY',
  'WARRANTY',
  'INSURANCE_POLICY',
  'EXPENSE',
  'INSPECTION_FINDING',
  'PROPERTY_TAX',
  'LOAN_ESTIMATE',
  'MATERIAL_SPEC',
  'CLAIM',
] as const;

export type DocumentPromotionTargetDomain = typeof DOCUMENT_PROMOTION_TARGET_DOMAINS[number];

export type DocumentPromotionReviewGate =
  /** A persisted candidate row (ExtractedFactCandidate, MaterialExtractionReview, or an equivalent) must be explicitly confirmed/corrected/rejected before promotion. */
  | 'REVIEW_GATED_CANDIDATE'
  /** No persisted candidate; the extractor's output pre-fills a client-side form and the homeowner's own form submission is the review step. */
  | 'CLIENT_FORM_PREFILL_ONLY'
  /** No extraction pipeline exists for this domain at all. */
  | 'NONE';

export interface DocumentPromotionAdapterEntry {
  targetDomain: DocumentPromotionTargetDomain;
  adapterExists: boolean;
  adapterFunction: string | null;
  sourceFile: string | null;
  /** Whether the extraction step feeding this adapter returns the common ExtractionEnvelope (HI-DOC-001) rather than an ad-hoc per-domain shape. */
  consumesExtractionEnvelope: boolean;
  reviewGate: DocumentPromotionReviewGate;
  /** Whether a promoted candidate is checked against an existing conflicting fact/record before being applied (HI-DOC-004). */
  conflictDetection: boolean;
  notes: string;
}

export function validateDocumentPromotionAdapterRegistry(
  entries: readonly DocumentPromotionAdapterEntry[],
): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  const declaredDomains = new Set(entries.map((entry) => entry.targetDomain));

  for (const domain of DOCUMENT_PROMOTION_TARGET_DOMAINS) {
    if (!declaredDomains.has(domain)) {
      issues.push(`documentPromotionAdapterRegistry is missing a row for target domain "${domain}".`);
    }
  }

  for (const entry of entries) {
    if (seen.has(entry.targetDomain)) {
      issues.push(`Duplicate documentPromotionAdapterRegistry entry for domain "${entry.targetDomain}".`);
    }
    seen.add(entry.targetDomain);

    if (!DOCUMENT_PROMOTION_TARGET_DOMAINS.includes(entry.targetDomain)) {
      issues.push(`documentPromotionAdapterRegistry entry references unknown target domain "${entry.targetDomain}".`);
    }
    if (entry.adapterExists && !entry.adapterFunction) {
      issues.push(`documentPromotionAdapterRegistry entry "${entry.targetDomain}" has adapterExists=true but declares no adapterFunction.`);
    }
    if (!entry.adapterExists && entry.adapterFunction) {
      issues.push(`documentPromotionAdapterRegistry entry "${entry.targetDomain}" declares an adapterFunction but adapterExists=false.`);
    }
    if (entry.adapterExists && !entry.sourceFile) {
      issues.push(`documentPromotionAdapterRegistry entry "${entry.targetDomain}" has adapterExists=true but declares no sourceFile.`);
    }
    if (!entry.adapterExists && entry.consumesExtractionEnvelope) {
      issues.push(`documentPromotionAdapterRegistry entry "${entry.targetDomain}" claims to consume the extraction envelope but has no adapter.`);
    }
    // A CLIENT_FORM_PREFILL_ONLY domain has a real extractor but
    // deliberately no server-side adapter (the homeowner's own form
    // submission is the review step) — only REVIEW_GATED_CANDIDATE
    // requires adapterExists to be true.
    if (!entry.adapterExists && entry.reviewGate === 'REVIEW_GATED_CANDIDATE') {
      issues.push(`documentPromotionAdapterRegistry entry "${entry.targetDomain}" declares reviewGate REVIEW_GATED_CANDIDATE but has no adapter.`);
    }
    if (entry.adapterExists && entry.reviewGate === 'NONE') {
      issues.push(`documentPromotionAdapterRegistry entry "${entry.targetDomain}" has an adapter but declares reviewGate NONE.`);
    }
    if (!entry.notes.trim()) {
      issues.push(`documentPromotionAdapterRegistry entry "${entry.targetDomain}" declares no notes.`);
    }
  }

  return issues;
}
