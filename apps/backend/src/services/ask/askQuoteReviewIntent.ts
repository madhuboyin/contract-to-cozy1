import type { AskOperationResult } from './askOperationRegistry';

const QUOTE_REVIEW_BLOCK_IDS = new Set([
  'quote-review-empty',
  'quote-review-summary',
  'quote-review-table',
  'quote-review-gaps',
  'quote-review-evidence',
  'quote-review-boundary',
  'related-capabilities',
  'ask-next-actions',
]);

/**
 * The quote review is built from the canonical comparison workspace: provider names, prices, scope and terms vary
 * by home, so word overlap with the operation's examples is not a dependable relevance signal. Found building the
 * comparison strip (FRD v1.76): "Compare my roofing quotes" came back as a clarification with the old table answer
 * too (INSUFFICIENT_RELEVANCE_SIGNAL). Accept only the envelope this operation itself produces, led by its own summary.
 */
export function matchesQuoteComparisonReviewAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;
  const hasSummary = result.blocks.some((block) => block.type === 'SUMMARY' && (block.id === 'quote-review-summary' || block.id === 'quote-review-empty'));
  return hasSummary && result.blocks.every((block) => QUOTE_REVIEW_BLOCK_IDS.has(block.id));
}
