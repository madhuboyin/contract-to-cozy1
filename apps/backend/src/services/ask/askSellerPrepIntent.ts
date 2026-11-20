import type { AskOperationResult } from './askOperationRegistry';

const SELLER_PREP_CHECKLIST_BLOCK_IDS = new Set([
  'seller-prep-summary',
  'seller-prep-progress',
  'seller-prep-open-items',
  'seller-prep-evidence',
  'seller-prep-boundary',
  // Optional blocks the checklist read adds to an unfiltered answer (FRD v1.443, v1.444): leaving them out made a valid answer read as a different request.
  'seller-prep-upgrades',
  'seller-prep-transition',
  'related-capabilities',
  'ask-next-actions',
]);

/**
 * The seller-prep checklist is built from the sale case's canonical readiness items, whose titles ("Repair the
 * cracked foundation wall", "Confirm the deck permit") read like inspection findings or maintenance tasks, so word
 * overlap is not a dependable relevance signal. Found building the progress ring (FRD v1.80): the checklist answer
 * came back as a clarification with or without the ring (ANSWER_FAVORS_DIFFERENT_OPERATION). Accept only the envelope
 * this operation itself produces, led by its own summary.
 */
export function matchesSellerPrepChecklistAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;
  const hasSummary = result.blocks.some((block) => block.type === 'SUMMARY' && block.id === 'seller-prep-summary');
  return hasSummary && result.blocks.every((block) => SELLER_PREP_CHECKLIST_BLOCK_IDS.has(block.id));
}
