import type { AskOperationResult } from './askOperationRegistry';

const COVERAGE_GAPS_BLOCK_IDS = new Set([
  'coverage-summary',
  'coverage-groups',
  'coverage-evidence',
  'coverage-boundary',
  'related-capabilities',
  'ask-next-actions',
]);

/**
 * Coverage rows describe equipment and record states, so lexical overlap with
 * an exposure-focused follow-up is intentionally small. Accept only the typed
 * envelope produced by COVERAGE_GAPS, led by its canonical summary.
 */
export function matchesCoverageGapsAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;
  const hasSummary = result.blocks.some((block) => block.type === 'SUMMARY' && block.id === 'coverage-summary');
  return hasSummary && result.blocks.every((block) => COVERAGE_GAPS_BLOCK_IDS.has(block.id));
}
