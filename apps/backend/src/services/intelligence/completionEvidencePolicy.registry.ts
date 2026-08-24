import { RECOMMENDATION_SAFETY_TIERS, type RecommendationSafetyTier } from '../../productFramework/recommendationGovernance.contract';

/**
 * Home Intelligence Functional Completeness FRD §8.5 (HI-OUT-002) —
 * consequence-based completion evidence policy, keyed by the same
 * RecommendationSafetyTier already declared on every HomeAction's
 * governance.safetyTier (recommendationGovernance.contract.ts) rather than
 * a new parallel consequence tier. Rows are the FRD table verbatim.
 * Consumed starting Phase 4 (completion UI); defined now per Phase 0 work
 * item 5.
 */
export interface CompletionEvidencePolicyEntry {
  safetyTier: RecommendationSafetyTier;
  attestation: 'PERMITTED' | 'REQUIRED' | 'INSUFFICIENT';
  costOrObservedResult: 'NOT_REQUIRED' | 'REQUIRED';
  recordEvidence: 'NOT_REQUIRED' | 'WHEN_AVAILABLE' | 'DOMAIN_RECORD_OR_DOCUMENT' | 'EVIDENCE_OR_PROFESSIONAL_CONFIRMATION';
  policyOrClaimLinkage: 'NOT_REQUIRED' | 'WHEN_APPLICABLE';
  requiresDomainOwnedResolution: boolean;
  simpleDismissalAllowed: boolean;
  minimumCompletionBehavior: string;
}

export const COMPLETION_EVIDENCE_POLICY: readonly CompletionEvidencePolicyEntry[] = [
  {
    safetyTier: 'LOW_CONSEQUENCE',
    attestation: 'PERMITTED',
    costOrObservedResult: 'NOT_REQUIRED',
    recordEvidence: 'NOT_REQUIRED',
    policyOrClaimLinkage: 'NOT_REQUIRED',
    requiresDomainOwnedResolution: false,
    simpleDismissalAllowed: true,
    minimumCompletionBehavior: 'Homeowner attestation permitted.',
  },
  {
    safetyTier: 'MATERIAL_FINANCIAL',
    attestation: 'REQUIRED',
    costOrObservedResult: 'REQUIRED',
    recordEvidence: 'WHEN_AVAILABLE',
    policyOrClaimLinkage: 'NOT_REQUIRED',
    requiresDomainOwnedResolution: false,
    simpleDismissalAllowed: true,
    minimumCompletionBehavior: 'Attestation plus cost/result; document or domain record when available.',
  },
  {
    safetyTier: 'REGULATED_COVERAGE',
    attestation: 'INSUFFICIENT',
    costOrObservedResult: 'NOT_REQUIRED',
    recordEvidence: 'DOMAIN_RECORD_OR_DOCUMENT',
    policyOrClaimLinkage: 'WHEN_APPLICABLE',
    requiresDomainOwnedResolution: false,
    simpleDismissalAllowed: true,
    minimumCompletionBehavior: 'Domain completion record or document evidence; policy/claim linkage where applicable.',
  },
  {
    safetyTier: 'SAFETY_EMERGENCY',
    attestation: 'INSUFFICIENT',
    costOrObservedResult: 'NOT_REQUIRED',
    recordEvidence: 'EVIDENCE_OR_PROFESSIONAL_CONFIRMATION',
    policyOrClaimLinkage: 'NOT_REQUIRED',
    requiresDomainOwnedResolution: true,
    simpleDismissalAllowed: false,
    minimumCompletionBehavior: 'Domain-owned resolution plus evidence or qualified-professional confirmation; simple dismissal prohibited.',
  },
];

export function validateCompletionEvidencePolicy(
  entries: readonly CompletionEvidencePolicyEntry[],
): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.safetyTier)) {
      issues.push(`Duplicate completionEvidencePolicy entry for safety tier "${entry.safetyTier}".`);
    }
    seen.add(entry.safetyTier);
    if (!entry.minimumCompletionBehavior.trim()) {
      issues.push(`completionEvidencePolicy entry "${entry.safetyTier}" declares no minimum completion behavior.`);
    }
    if (entry.safetyTier === 'SAFETY_EMERGENCY' && (!entry.requiresDomainOwnedResolution || entry.simpleDismissalAllowed)) {
      issues.push('completionEvidencePolicy SAFETY_EMERGENCY must require domain-owned resolution and prohibit simple dismissal.');
    }
    if (entry.safetyTier === 'REGULATED_COVERAGE' && entry.recordEvidence !== 'DOMAIN_RECORD_OR_DOCUMENT') {
      issues.push('completionEvidencePolicy REGULATED_COVERAGE must require a domain record or document.');
    }
    if (entry.safetyTier === 'MATERIAL_FINANCIAL' && entry.costOrObservedResult !== 'REQUIRED') {
      issues.push('completionEvidencePolicy MATERIAL_FINANCIAL must require cost or observed-result capture.');
    }
  }
  for (const tier of RECOMMENDATION_SAFETY_TIERS) {
    if (!seen.has(tier)) {
      issues.push(`No completionEvidencePolicy entry declared for safety tier "${tier}".`);
    }
  }
  return issues;
}
