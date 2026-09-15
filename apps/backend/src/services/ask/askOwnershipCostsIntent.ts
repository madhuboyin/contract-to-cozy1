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
    // Same gap as askMaintenanceIntent.ts's identical whitelist (fixed
    // 2026-09-15): askNextActions.ts's buildAskNextActionsBlock() appends
    // this generic CAPABILITY_LIST block to any successful operation
    // result, including OWNERSHIP_COSTS -- an unlisted id here fails this
    // fast path and forces a genuinely correct answer through semantic-
    // similarity scoring instead.
    'ask-next-actions',
  ].includes(block.id));
}
