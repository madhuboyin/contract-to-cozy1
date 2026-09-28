import type { AskOperationResult } from './askOperationRegistry';

/**
 * Recognizes the stable, adapter-owned Property Summary response. Record
 * values such as room and appliance names are intentionally excluded from
 * semantic relevance projection, so generic text similarity cannot reliably
 * certify a room-heavy answer even when it came from the canonical handler.
 */
export function matchesPropertySummaryAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;

  const hasSummary = result.blocks.some((block) => (
    block.type === 'SUMMARY' && block.id === 'property-summary'
  ));
  const hasEvidence = result.blocks.some((block) => (
    block.type === 'EVIDENCE' && block.id === 'property-summary-evidence'
  ));
  const hasFocusedRooms = result.blocks.some((block) => (
    block.type === 'GROUPED_LIST'
    && block.id === 'property-rooms'
    && block.presentation?.pattern === 'ROOM_MAP'
    && block.presentation.focused === true
  ));

  return hasSummary && (hasEvidence || hasFocusedRooms);
}
