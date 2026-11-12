import type { AskOperationResult } from './askOperationRegistry';

/** FR-GATE-1: the block ids a read answer of INVENTORY_LOOKUP may carry. The contract below reads these constants, and tests/ask/answerContractConformance.test.js
 *  checks every one is still emitted by the handler, so renaming a block id in the handler cannot silently strand the contract. */
export const INVENTORY_READ_ANSWER_BLOCK_IDS = Object.freeze({
  EMPTY: 'inventory-empty', NO_MATCH: 'inventory-no-match', RESULTS: 'inventory-results', ROOF_PROFILE: 'inventory-roof-profile',
} as const);

const INVENTORY_SUBJECT = '(?:inventory|appliance|system|equipment)';
const DETAIL_SUBJECT = '(?:details|information|records?)';

const INCOMPLETE_INVENTORY_PATTERNS = [
  /\badd\s+(?:or|\/)\s+update\s+missing\s+details\b/i,
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
      && block.id === INVENTORY_READ_ANSWER_BLOCK_IDS.EMPTY
      && /no inventory items are recorded/i.test(block.title)
  ) || (
    block.type === 'SUMMARY'
      && block.id === INVENTORY_READ_ANSWER_BLOCK_IDS.NO_MATCH
      && /incomplete inventory records/i.test(block.title)
  ) || (
    block.type === 'GROUPED_LIST'
      && block.id === INVENTORY_READ_ANSWER_BLOCK_IDS.RESULTS
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
      && block.id === INVENTORY_READ_ANSWER_BLOCK_IDS.EMPTY
      && /no inventory items are recorded/i.test(block.title)
  ));
  if (empty) return true;

  // The roof is recorded on the home profile, not as an item: its answer is one profile summary the handler itself produced.
  if (result.reasonCode === 'INVENTORY_ROOF_FROM_PROFILE'
    && result.blocks.length === 1
    && result.blocks[0].type === 'SUMMARY'
    && result.blocks[0].id === INVENTORY_READ_ANSWER_BLOCK_IDS.ROOF_PROFILE) return true;

  if (isIncompleteInventoryRequest(question)) {
    return matchesIncompleteInventoryAnswerContract(result);
  }

  if (isLifecycleInventoryRequest(question)) {
    return result.blocks.some((block) => (
      block.type === 'SUMMARY'
        && block.id === INVENTORY_READ_ANSWER_BLOCK_IDS.NO_MATCH
        && /items with a recorded end-of-life date in the next three years/i.test(block.title)
    ) || (
      block.type === 'GROUPED_LIST'
        && block.id === INVENTORY_READ_ANSWER_BLOCK_IDS.RESULTS
        && /recorded lifecycle dates approaching/i.test(block.title)
    ));
  }

  return result.blocks.some((block) => (
    block.type === 'SUMMARY'
      && block.id === INVENTORY_READ_ANSWER_BLOCK_IDS.NO_MATCH
      && /matching inventory record/i.test(block.title)
  ) || (
    block.type === 'GROUPED_LIST'
      && block.id === INVENTORY_READ_ANSWER_BLOCK_IDS.RESULTS
      && /inventory details/i.test(block.title)
  ));
}
