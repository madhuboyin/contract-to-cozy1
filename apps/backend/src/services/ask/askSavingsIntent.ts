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
    block.type === 'SUMMARY' && block.id.startsWith('savings-')
  ));
  if (!hasCanonicalSummary) return false;
  // Every block the savings handler emits is a savings- block (headline, recurring setup, realized totals, exclusion conflicts, ...); a new one
  // must not push a correct answer off this fast path. The generic related-capabilities and ask-next-actions blocks are appended to any answer.
  return result.blocks.every((block) => block.id.startsWith('savings-') || block.id === 'related-capabilities' || block.id === 'ask-next-actions');
}
