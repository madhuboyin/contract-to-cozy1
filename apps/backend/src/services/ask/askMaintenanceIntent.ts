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
  ].includes(block.id));
}
