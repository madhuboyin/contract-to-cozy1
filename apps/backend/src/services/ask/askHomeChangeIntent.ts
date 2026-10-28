import type { AskOperationResult } from './askOperationRegistry';

const AUXILIARY_BLOCK_IDS = new Set([
  'related-capabilities',
  'ask-next-actions',
]);

/**
 * HOME_CHANGE_SUMMARY is a deterministic projection of the canonical property
 * change ledger. Its homeowner-visible text is record-dependent and may name a
 * different capability (for example, "Home action confirmed"), so text
 * similarity alone can falsely classify a valid change as a HOME_ACTIONS
 * answer. Accept only the adapter-owned change or empty-state envelopes;
 * source lineage and the remaining answer-trust checks still run separately.
 */
export function matchesHomeChangeSummaryAnswerContract(result: AskOperationResult): boolean {
  if (result.status !== 'ANSWERED' || !result.blocks.length) return false;

  const substantiveBlocks = result.blocks.filter((block) => !AUXILIARY_BLOCK_IDS.has(block.id));
  if (!substantiveBlocks.length) return false;

  const isEmptyEnvelope = substantiveBlocks.length === 1
    && substantiveBlocks[0].type === 'EMPTY_STATE'
    && substantiveBlocks[0].id === 'home-change-summary-empty';
  if (isEmptyEnvelope) return true;

  // The found-changes envelope leads with its own 'home-change-summary' SUMMARY, then one CHANGE_SUMMARY per change.
  const changeBlocks = substantiveBlocks.filter((block) => block.id !== 'home-change-summary');
  return changeBlocks.length > 0 && changeBlocks.every((block) => (
    block.type === 'CHANGE_SUMMARY'
    && block.id.startsWith('home-change-')
  ));
}
