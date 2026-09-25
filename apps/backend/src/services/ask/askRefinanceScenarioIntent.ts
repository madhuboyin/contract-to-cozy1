import type { AskOperationResult } from './askOperationRegistry';

const REFINANCE_SCENARIO_BLOCK_IDS = new Set([
  'refinance-scenario-summary',
  'refinance-scenario-table',
  'refinance-scenario-evidence',
  'refinance-scenario-boundary',
  'related-capabilities',
  'ask-next-actions',
]);

/**
 * The hypothetical refinance scenario is built from the homeowner's own rate and term and the canonical comparison:
 * rates, amounts and metric names vary by home, so word overlap with the operation's examples is not a dependable
 * relevance signal. Found building the comparison strip (FRD v1.87): a "what if I refinanced at 5.5%" answer came
 * back as a clarification (INSUFFICIENT_RELEVANCE_SIGNAL) with the earlier two-table answer too. Accept only the
 * envelope this branch itself produces, led by its own summary.
 */
export function matchesRefinanceScenarioAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;
  const hasSummary = result.blocks.some((block) => block.type === 'SUMMARY' && block.id === 'refinance-scenario-summary');
  return hasSummary && result.blocks.every((block) => REFINANCE_SCENARIO_BLOCK_IDS.has(block.id));
}
