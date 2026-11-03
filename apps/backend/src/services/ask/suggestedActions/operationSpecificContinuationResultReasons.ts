import type { AskOperationId } from '../askOperationRegistry';
import { OPERATION_SPECIFIC_CONTINUATION_RECIPES } from './operationSpecificContinuationRecipes';

/**
 * Result reason codes a continuation recipe may gate on, scoped to the operation that emits them. A recipe's
 * `omitWhenResultReason` is only meaningful if the SOURCE operation's handler can actually emit that code, so a typo or a code
 * copied from another operation would silently never match. Register an operation here only when one of its recipes gates on a
 * result reason; each entry lists the reason codes that operation's handler is known to emit (pinned by a focused handler test).
 * Dynamic families (for example `INSPECTION_FINDING_${kind}_COMPLETED`) must not be listed as if they were static.
 */
export const GATEABLE_RESULT_REASONS: Readonly<Partial<Record<AskOperationId, readonly string[]>>> = Object.freeze({
  HVAC_DECISION_START: Object.freeze([
    'HVAC_DECISION_ITEM_REQUIRED',
    'HVAC_DECISION_ITEM_AMBIGUOUS',
    'HVAC_DECISION_THREAD_AMBIGUOUS',
    'HVAC_DECISION_ALREADY_ACTIVE',
    'HVAC_DECISION_START_CONFIRMATION_REQUIRED',
  ]),
  // Emitted by confirmInspectionFindingUpdate (workflowConfirm.handler.ts). The batch path emits INSPECTION_FINDING_BATCH_UPDATED, which is not gated.
  INSPECTION_FINDING_UPDATE: Object.freeze([
    'INSPECTION_FINDING_ACCEPTED',
    'INSPECTION_FINDING_DISMISSED',
    'INSPECTION_FINDING_RESOLVED',
  ]),
});

/** Strict gate: every recipe result-reason gate must name a reason registered for its own source operation. */
export function validateResultReasonGates(): string[] {
  const issues: string[] = [];
  for (const [source, recipes] of Object.entries(OPERATION_SPECIFIC_CONTINUATION_RECIPES)) {
    const registered = GATEABLE_RESULT_REASONS[source as AskOperationId] ?? [];
    for (const entry of recipes ?? []) {
      for (const reason of entry.omitWhenResultReason ?? []) {
        if (!registered.includes(reason)) issues.push(`${source} -> ${entry.operationId}: gates on unregistered result reason ${reason}`);
      }
    }
  }
  return issues;
}
