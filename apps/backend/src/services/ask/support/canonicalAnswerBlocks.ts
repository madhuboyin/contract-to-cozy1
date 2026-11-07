// Ask handler support: canonical typed answers. An operation's handler names its answer blocks with a fixed prefix ("repair-replace-guidance",
// "plant-care-summary"). A result that carries such a block IS that operation's own answer, so the relevance check (which compares the answer's words
// with the question's and cannot tell "Roof: keep monitoring" from a quote comparison) has nothing left to decide. Without an entry here an
// operation's own correct answer can be refused as "not what you asked for" (review screenshots 2026-11-07: "do I need a new roof").
// Adding an operation: list the id prefix its handler uses for its answer blocks. The fallback's own block ("grounded-guidance") never counts.
import type { AskOperationId } from '../askOperationRegistry';

export const CANONICAL_ANSWER_BLOCK_ID_PREFIXES: Readonly<Partial<Record<AskOperationId, readonly string[]>>> = Object.freeze({
  // REPLACEMENT_GUIDANCE hands an HVAC item to the HVAC decision, whose answer blocks carry the decision's own prefix.
  REPLACEMENT_GUIDANCE: ['repair-replace-', 'hvac-decision-'],
  PLANT_CARE_OUTLOOK: ['plant-care-'],
  MATERIAL_SPECS_LIST: ['material-specs-'],
  HOME_TIMELINE_EVENTS: ['home-timeline-'],
  NEIGHBORHOOD_CHANGE_FEED: ['neighborhood-change'],
});

// A boundary or an evidence footer alone is not an answer.
const NOT_AN_ANSWER_BLOCK_TYPES = new Set(['BOUNDARY', 'EVIDENCE']);

export function matchesCanonicalAnswerBlocks(operationId: AskOperationId, result: { blocks: ReadonlyArray<{ type: string; id?: string }> }): boolean {
  const prefixes = CANONICAL_ANSWER_BLOCK_ID_PREFIXES[operationId];
  if (!prefixes) return false;
  return result.blocks.some((block) => !NOT_AN_ANSWER_BLOCK_TYPES.has(block.type) && typeof block.id === 'string' && prefixes.some((prefix) => block.id!.startsWith(prefix)));
}
