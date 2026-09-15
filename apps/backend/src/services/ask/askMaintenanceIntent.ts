import type { AskOperationResult } from './askOperationRegistry';

/**
 * Maintenance status is a deterministic canonical read. Validate its stable
 * typed block identities instead of requiring generated or record-dependent
 * wording to resemble one semantic fixture.
 */
export function matchesMaintenanceStatusAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;
  const hasCanonicalSummary = result.blocks.some((block) => block.type === 'SUMMARY' && (
    block.id === 'maintenance-summary'
    || block.id === 'seasonal-maintenance-summary'
    || block.id === 'seasonal-context-unavailable'
  ));
  if (!hasCanonicalSummary) return false;
  return result.blocks.every((block) => [
    'maintenance-summary',
    'maintenance-groups',
    'maintenance-evidence',
    'maintenance-purchase-date-missing',
    'maintenance-record-boundary',
    'seasonal-maintenance-summary',
    'seasonal-maintenance-items',
    'seasonal-context-unavailable',
    'related-capabilities',
    // Found verifying the interaction dispatcher (browser session,
    // 2026-09-15): askNextActions.ts appends this generic CAPABILITY_LIST
    // block (id 'ask-next-actions') to MAINTENANCE_STATUS responses that
    // have a real next action to suggest, but this whitelist predates that
    // block and never listed it -- every such response fell through the
    // canonical-contract fast path into semantic-similarity scoring, which
    // for some genuinely-correct answers returned UNKNOWN and produced a
    // spurious "I need one detail to verify this answer" clarification.
    // The other per-operation whitelists (askSavingsIntent.ts,
    // askHomeActionsIntent.ts, askOwnershipCostsIntent.ts) list only
    // 'related-capabilities' too and likely have the identical gap --
    // out of scope to fix here without separately verifying each.
    'ask-next-actions',
  ].includes(block.id));
}
