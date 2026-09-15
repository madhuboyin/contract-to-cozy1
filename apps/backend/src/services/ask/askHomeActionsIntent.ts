import type { AskOperationResult } from './askOperationRegistry';

// Same gap as askMaintenanceIntent.ts's identical whitelist (fixed
// 2026-09-15): askNextActions.ts's buildAskNextActionsBlock() appends this
// generic CAPABILITY_LIST block to any successful operation result,
// including every Home Actions envelope below -- an unlisted id in any of
// these three sets fails its fast path and forces a genuinely correct
// answer through semantic-similarity scoring instead.
const FEED_BLOCK_IDS = new Set([
  'home-actions-summary',
  'home-actions-priority-list',
  'home-actions-list',
  'home-actions-evidence',
  'home-actions-boundary',
  'related-capabilities',
  'ask-next-actions',
]);

const FOCUSED_BLOCK_IDS = new Set([
  'focused-home-action-summary',
  'focused-home-action-guidance',
  'focused-home-action-evidence',
  'focused-home-action-boundary',
  'related-capabilities',
  'ask-next-actions',
]);

const BUYER_PLAN_BLOCK_IDS = new Set([
  'buyer-plan-summary',
  'buyer-plan-actions',
  'buyer-plan-professional-boundary',
  'buyer-plan-not-active',
  'related-capabilities',
  'ask-next-actions',
]);

/**
 * Home Actions are produced by the deterministic governed feed. Their titles,
 * explanations, evidence, and even empty-state copy necessarily vary by home,
 * so semantic word overlap is not a dependable relevance signal. Accept only
 * one of the two adapter-owned success envelopes. Source-operation lineage and
 * the remaining answer-trust checks still run independently of this contract.
 */
export function matchesHomeActionsAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;

  const ids = result.blocks.map((block) => block.id);
  const hasFeedSummary = result.blocks.some((block) => (
    block.type === 'SUMMARY' && block.id === 'home-actions-summary'
  ));
  if (hasFeedSummary) return ids.every((id) => FEED_BLOCK_IDS.has(id));

  const hasBuyerPlanSummary = result.blocks.some((block) => (
    block.type === 'SUMMARY'
    && (block.id === 'buyer-plan-summary' || block.id === 'buyer-plan-not-active')
  ));
  if (hasBuyerPlanSummary) return ids.every((id) => BUYER_PLAN_BLOCK_IDS.has(id));

  const hasFocusedSummary = result.blocks.some((block) => (
    block.type === 'SUMMARY' && block.id === 'focused-home-action-summary'
  ));
  const hasFocusedGuidance = result.blocks.some((block) => (
    block.type === 'GROUPED_LIST' && block.id === 'focused-home-action-guidance'
  ));
  return hasFocusedSummary
    && hasFocusedGuidance
    && ids.every((id) => FOCUSED_BLOCK_IDS.has(id));
}
