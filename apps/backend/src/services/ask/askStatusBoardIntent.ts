import type { AskOperationResult } from './askOperationRegistry';

const AUXILIARY_BLOCK_IDS = new Set(['related-capabilities', 'ask-next-actions']);
// Each adapter-owned block id with the one block type it carries; a block with a known id but another type is not this envelope.
const STATUS_BOARD_BLOCK_TYPES: Readonly<Record<string, string>> = {
  'status-board-summary': 'SUMMARY',
  'status-board-limits': 'LIMITATION',
  'status-board-items': 'GROUPED_LIST',
  'status-board-boundary': 'BOUNDARY',
};

/**
 * HOME_STATUS_BOARD is a deterministic projection of the board's recorded condition. Its text is record-dependent
 * (item names, how many items lack a date), so word similarity to "show my status board" can fall just under the
 * corroboration threshold when most items are unknown. Accept only the adapter-owned envelope, led by its summary;
 * source lineage and the remaining answer-trust checks still run separately.
 */
export function matchesStatusBoardAnswerContract(result: AskOperationResult): boolean {
  if (result.status !== 'ANSWERED' && result.status !== 'READY_WITH_LIMITATIONS') return false;
  const substantive = result.blocks.filter((block) => !AUXILIARY_BLOCK_IDS.has(block.id));
  if (!substantive.length || substantive[0].id !== 'status-board-summary') return false;
  return substantive.every((block) => STATUS_BOARD_BLOCK_TYPES[block.id] === block.type);
}
