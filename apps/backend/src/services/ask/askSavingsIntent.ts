import type { AskOperationResult } from './askOperationRegistry';

/**
 * Savings opportunities are a deterministic canonical read whose wording and
 * record values vary with each home. Trust the adapter-owned response shape,
 * while source-operation lineage and ordinary answer-trust checks continue to
 * reject unrelated or unsafe responses before this contract is considered.
 */
export function matchesSavingsOpportunitiesAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;
  const hasCanonicalSummary = result.blocks.some((block) => (
    block.type === 'SUMMARY' && block.id === 'savings-summary'
  ));
  if (!hasCanonicalSummary) return false;
  return result.blocks.every((block) => [
    'savings-summary',
    'savings-opportunity-groups',
    'savings-evidence',
    'related-capabilities',
  ].includes(block.id));
}
