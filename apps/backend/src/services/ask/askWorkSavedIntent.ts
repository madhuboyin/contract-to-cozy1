import type { AskOperationResult } from './askOperationRegistry';

const SHARED_BLOCK_IDS = ['related-capabilities', 'ask-next-actions'];

const WORK_BLOCK_IDS = new Set([
  'work-overview-summary',
  'work-overview-results',
  'work-overview-partial',
  'work-overview-boundary',
  ...SHARED_BLOCK_IDS,
]);

const WORK_RESTRICTED_BLOCK_IDS = new Set([
  'work-overview-restricted',
  'work-overview-boundary',
  ...SHARED_BLOCK_IDS,
]);

const SAVED_BLOCK_IDS = new Set([
  'saved-results-summary',
  'saved-results-list',
  'saved-results-partial',
  'saved-results-boundary',
  ...SHARED_BLOCK_IDS,
]);

const SAVED_RESTRICTED_BLOCK_IDS = new Set([
  'saved-results-restricted',
  'saved-results-boundary',
  ...SHARED_BLOCK_IDS,
]);

function isSuccessful(result: AskOperationResult): boolean {
  return result.status === 'ANSWERED' || result.status === 'READY_WITH_LIMITATIONS';
}

/**
 * Work is a deterministic canonical collection whose row copy varies by home.
 * Validate the handler-owned envelope instead of requiring that generated row
 * text resemble a semantic fixture. Other answer-trust checks, including
 * source-operation lineage, still run independently.
 */
export function matchesWorkOverviewAnswerContract(result: AskOperationResult): boolean {
  if (!isSuccessful(result)) return false;
  const ids = result.blocks.map((block) => block.id);
  const hasCollectionEnvelope = result.blocks.some((block) => block.type === 'SUMMARY' && block.id === 'work-overview-summary')
    && result.blocks.some((block) => block.type === 'GROUPED_LIST' && block.id === 'work-overview-results');
  if (hasCollectionEnvelope) return ids.every((id) => WORK_BLOCK_IDS.has(id));

  const hasRestrictedEnvelope = result.blocks.some((block) => block.type === 'EMPTY_STATE' && block.id === 'work-overview-restricted');
  return hasRestrictedEnvelope && ids.every((id) => WORK_RESTRICTED_BLOCK_IDS.has(id));
}

/** Saved is the corresponding deterministic artifact collection. */
export function matchesSavedResultsAnswerContract(result: AskOperationResult): boolean {
  if (!isSuccessful(result)) return false;
  const ids = result.blocks.map((block) => block.id);
  const hasCollectionEnvelope = result.blocks.some((block) => block.type === 'SUMMARY' && block.id === 'saved-results-summary')
    && result.blocks.some((block) => block.type === 'GROUPED_LIST' && block.id === 'saved-results-list');
  if (hasCollectionEnvelope) return ids.every((id) => SAVED_BLOCK_IDS.has(id));

  const hasRestrictedEnvelope = result.blocks.some((block) => block.type === 'EMPTY_STATE' && block.id === 'saved-results-restricted');
  return hasRestrictedEnvelope && ids.every((id) => SAVED_RESTRICTED_BLOCK_IDS.has(id));
}
