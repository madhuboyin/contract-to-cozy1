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
    // Same gap as askMaintenanceIntent.ts's identical whitelist (fixed
    // 2026-09-15): askNextActions.ts's buildAskNextActionsBlock() appends
    // this generic CAPABILITY_LIST block to any successful operation
    // result, including SAVINGS_OPPORTUNITIES -- an unlisted id here fails
    // this fast path and forces a genuinely correct answer through
    // semantic-similarity scoring instead.
    'ask-next-actions',
  ].includes(block.id));
}
