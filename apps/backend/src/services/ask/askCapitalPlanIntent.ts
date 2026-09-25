import type { AskOperationResult } from './askOperationRegistry';

const CAPITAL_PLAN_BLOCK_IDS = new Set([
  'capital-reserve-summary',
  'capital-timeline-table',
  'reserve-allocations',
  'capital-plan-evidence',
  'capital-plan-boundary',
  'related-capabilities',
  'ask-next-actions',
]);

/**
 * The capital reserve plan is built from the canonical capital timeline and reserve fund: item names, windows, costs
 * and confidence vary by home, so word overlap with the operation's examples is not a dependable relevance signal.
 * Found building the timeline track (FRD v1.90): whether the answer was kept depended on a few words of link and
 * evidence text (INSUFFICIENT_RELEVANCE_SIGNAL), with the earlier table answer as well. Accept only the envelope this
 * operation itself produces, led by its own summary.
 */
export function matchesCapitalPlanAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;
  const hasSummary = result.blocks.some((block) => block.type === 'SUMMARY' && block.id === 'capital-reserve-summary');
  return hasSummary && result.blocks.every((block) => CAPITAL_PLAN_BLOCK_IDS.has(block.id));
}
