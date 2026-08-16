import type { AskOperationResult } from './askOperationRegistry';

const INVENTORY_SUBJECT = '(?:inventory|appliance|system|equipment)';
const DETAIL_SUBJECT = '(?:details|information|records?)';

const INCOMPLETE_INVENTORY_PATTERNS = [
  new RegExp(`\\bmissing(?:\\s+${INVENTORY_SUBJECT})?\\s+${DETAIL_SUBJECT}\\b`, 'i'),
  new RegExp(`\\b${INVENTORY_SUBJECT}\\s+${DETAIL_SUBJECT}\\s+(?:are\\s+)?(?:missing|incomplete)\\b`, 'i'),
  new RegExp(`\\b(?:incomplete|unfinished)(?:\\s+${INVENTORY_SUBJECT})?(?:\\s+${DETAIL_SUBJECT})?\\b`, 'i'),
  new RegExp(`\\b${INVENTORY_SUBJECT}\\s+needs?\\s+(?:${DETAIL_SUBJECT}|completion)\\b`, 'i'),
] as const;

const LIFECYCLE_INVENTORY_PATTERN = /\b(?:end of life|nearing (?:replacement|expiry)|expir(?:e|y|ing)|oldest systems?)\b/i;

/**
 * Recognizes incomplete-inventory intent independently of word order so
 * first-party prompts and ordinary homeowner paraphrases use the same
 * canonical inventory filter.
 */
export function isIncompleteInventoryRequest(message: string): boolean {
  return INCOMPLETE_INVENTORY_PATTERNS.some((pattern) => pattern.test(message));
}

export function isLifecycleInventoryRequest(message: string): boolean {
  return LIFECYCLE_INVENTORY_PATTERN.test(message);
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

/**
 * Validates the stable, adapter-owned inventory response contract for the
 * requested focus. This deliberately checks typed block identity and focus-
 * specific titles instead of trusting arbitrary inventory-shaped prose.
 */
export function matchesInventoryAnswerContract(question: string, result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;

  const empty = result.blocks.some((block) => (
    block.type === 'SUMMARY'
      && block.id === 'inventory-empty'
      && /no inventory items are recorded/i.test(block.title)
  ));
  if (empty) return true;

  if (isIncompleteInventoryRequest(question)) {
    return matchesIncompleteInventoryAnswerContract(result);
  }

  if (isLifecycleInventoryRequest(question)) {
    return result.blocks.some((block) => (
      block.type === 'SUMMARY'
        && block.id === 'inventory-no-match'
        && /items with a recorded end-of-life date in the next three years/i.test(block.title)
    ) || (
      block.type === 'GROUPED_LIST'
        && block.id === 'inventory-results'
        && /recorded lifecycle dates approaching/i.test(block.title)
    ));
  }

  return result.blocks.some((block) => (
    block.type === 'SUMMARY'
      && block.id === 'inventory-no-match'
      && /matching inventory record/i.test(block.title)
  ) || (
    block.type === 'GROUPED_LIST'
      && block.id === 'inventory-results'
      && /inventory details/i.test(block.title)
  ));
}
