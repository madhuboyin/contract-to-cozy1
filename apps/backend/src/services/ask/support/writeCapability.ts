// FR-WRT-4 (reliability FRD): "can this operation change state" is decided by the domain-command registry, NOT by the registry `effect` label, which the write trace
// (docs/architecture/ASK_COZY_WRITE_SAFETY_TRACE.md) found wrong in both directions. The `effect` label still drives calibration and routing thresholds, so it is not relabelled here.
import { getAskDomainCommandByOperation } from '../askDomainCommandRegistry';

/** Operations that persist user-visible state without a domain command (write trace §results). Each is reviewed and tested; do not add without a trace entry. */
export const WRITE_CAPABLE_WITHOUT_COMMAND: ReadonlySet<string> = new Set([
  'REFINANCE_RATE_MONITOR', 'HOME_DEADLINE_MONITOR', 'HVAC_DECISION_START', 'HVAC_DECISION_SCENARIO',
]);

/** Persists analysis rows on a read-shaped request (ReplaceRepairAnalysis; HVAC branch decision threads). Not composable as a read until the D17 pure path exists. */
export const PERSISTS_ON_READ: ReadonlySet<string> = new Set(['REPLACEMENT_GUIDANCE']);

export function isWriteCapableOperation(operationId: string): boolean {
  return getAskDomainCommandByOperation(operationId) !== null || WRITE_CAPABLE_WITHOUT_COMMAND.has(operationId) || PERSISTS_ON_READ.has(operationId);
}
