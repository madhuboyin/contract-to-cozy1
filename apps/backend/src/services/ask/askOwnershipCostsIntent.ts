import type { AskOperationResult } from './askOperationRegistry';

/**
 * Ownership costs are returned by a deterministic canonical read model. The
 * amounts, category labels, evidence, and completeness vary per home, so
 * semantic relevance relies on stable adapter-owned block identity after
 * ordinary source, boundary, action, and operation-lineage checks.
 */
export function matchesOwnershipCostsAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;
  const hasCanonicalSummary = result.blocks.some((block) => (
    block.type === 'SUMMARY' && block.id === 'ownership-costs-summary'
  ));
  if (!hasCanonicalSummary) return false;
  return result.blocks.every((block) => [
    'ownership-costs-summary',
    'ownership-cost-categories',
    'ownership-cost-missing',
    'ownership-cost-evidence',
    'ownership-cost-lens-boundary',
    'related-capabilities',
  ].includes(block.id));
}
