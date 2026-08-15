import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';

const SEMANTIC_VISIBLE_KEYS = new Set([
  'title', 'body', 'label', 'description', 'summary', 'value', 'detail', 'meta',
  'expectedOutput', 'readinessLabel', 'sourceBoundary', 'threshold', 'product',
  'channel', 'cadence', 'quietHours', 'limitation', 'note', 'observedCostLabel',
  'predictedCostLabel', 'watchState', 'status', 'verdict', 'timingNote',
]);

/**
 * Produces a bounded, homeowner-visible semantic projection of typed Ask
 * blocks. Identifiers, hrefs, reason codes, and hidden parameters are omitted.
 * This lets relevance validation consider rich lists/tables/decision blocks
 * without serializing unrestricted records into the validator.
 */
export function projectAskSemanticResponse(
  blocks: readonly AskPresentationBlock[],
  maxChars = 6_000,
): string {
  const parts: string[] = [];
  let remaining = Math.max(0, maxChars);
  const append = (value: string): void => {
    if (remaining <= 0) return;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    const bounded = normalized.slice(0, remaining);
    parts.push(bounded);
    remaining -= bounded.length + 1;
  };
  const visit = (value: unknown, key?: string): void => {
    if (remaining <= 0) return;
    if (typeof value === 'string') {
      if (key && SEMANTIC_VISIBLE_KEYS.has(key)) append(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  blocks.forEach((block) => visit(block));
  return parts.join(' ');
}
