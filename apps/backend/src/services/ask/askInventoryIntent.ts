import type { AskOperationResult } from './askOperationRegistry';

const INVENTORY_SUBJECT = '(?:inventory|appliance|system|equipment)';
const DETAIL_SUBJECT = '(?:details|information|records?)';

const INCOMPLETE_INVENTORY_PATTERNS = [
  new RegExp(`\\bmissing(?:\\s+${INVENTORY_SUBJECT})?\\s+${DETAIL_SUBJECT}\\b`, 'i'),
  new RegExp(`\\b${INVENTORY_SUBJECT}\\s+${DETAIL_SUBJECT}\\s+(?:are\\s+)?(?:missing|incomplete)\\b`, 'i'),
  new RegExp(`\\b(?:incomplete|unfinished)(?:\\s+${INVENTORY_SUBJECT})?(?:\\s+${DETAIL_SUBJECT})?\\b`, 'i'),
  new RegExp(`\\b${INVENTORY_SUBJECT}\\s+needs?\\s+(?:${DETAIL_SUBJECT}|completion)\\b`, 'i'),
] as const;

/**
 * Recognizes incomplete-inventory intent independently of word order so
 * first-party prompts and ordinary homeowner paraphrases use the same
 * canonical inventory filter.
 */
export function isIncompleteInventoryRequest(message: string): boolean {
  return INCOMPLETE_INVENTORY_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * The inventory adapter has three truthful outcomes for an incomplete-record
 * request: no inventory exists, inventory exists but no incomplete rows match,
 * or one/more incomplete rows are returned. Narrative synthesis may rewrite a
 * summary body, so semantic trust uses stable typed block identity and titles
 * rather than requiring the model-authored wording to resemble one fixture.
 */
export function matchesIncompleteInventoryAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;
  return result.blocks.some((block) => (
    block.type === 'SUMMARY'
      && block.id === 'inventory-empty'
      && /no inventory items are recorded/i.test(block.title)
  ) || (
    block.type === 'SUMMARY'
      && block.id === 'inventory-no-match'
      && /incomplete inventory records/i.test(block.title)
  ) || (
    block.type === 'GROUPED_LIST'
      && block.id === 'inventory-results'
      && /incomplete inventory records/i.test(block.title)
  ));
}
