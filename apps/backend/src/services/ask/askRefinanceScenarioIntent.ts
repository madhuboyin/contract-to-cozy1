import type { AskOperationResult } from './askOperationRegistry';

// Each adapter-owned block id with the one type it carries. 'refinance-scenario-details' and 'refinance-scenario-assumptions' were
// missing from the earlier id set, so a real scenario answer never matched this contract (Presentation Quality 3C).
const REFINANCE_SCENARIO_BLOCK_TYPES: Readonly<Record<string, string>> = {
  'refinance-scenario-summary': 'SUMMARY',
  'refinance-scenario-table': 'COMPARISON',
  'refinance-scenario-details': 'TABLE',
  'refinance-scenario-assumptions': 'ASSUMPTIONS',
  'refinance-scenario-evidence': 'EVIDENCE',
  'refinance-scenario-boundary': 'BOUNDARY',
};
const AUXILIARY_BLOCK_IDS = new Set(['related-capabilities', 'ask-next-actions']);

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
  return hasSummary && result.blocks.every((block) => AUXILIARY_BLOCK_IDS.has(block.id) || REFINANCE_SCENARIO_BLOCK_TYPES[block.id] === block.type);
}
