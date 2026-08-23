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
  minimumCompletionBehavior: string;
}

export const COMPLETION_EVIDENCE_POLICY: readonly CompletionEvidencePolicyEntry[] = [
  {
    safetyTier: 'LOW_CONSEQUENCE',
    minimumCompletionBehavior: 'Homeowner attestation permitted.',
  },
  {
    safetyTier: 'MATERIAL_FINANCIAL',
    minimumCompletionBehavior: 'Attestation plus cost/result; document or domain record when available.',
  },
  {
    safetyTier: 'REGULATED_COVERAGE',
    minimumCompletionBehavior: 'Domain completion record or document evidence; policy/claim linkage where applicable.',
  },
  {
    safetyTier: 'SAFETY_EMERGENCY',
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
  }
  for (const tier of RECOMMENDATION_SAFETY_TIERS) {
    if (!seen.has(tier)) {
      issues.push(`No completionEvidencePolicy entry declared for safety tier "${tier}".`);
    }
  }
  return issues;
}
