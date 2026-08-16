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
