import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../ask/askOperationRegistry';

/**
 * Home Intelligence Functional Completeness FRD Phase 6 (HI-SKL-002 /
 * HI-SKL-003) work item 5 — startup parity validation for the Ask/Skill
 * governance boundary. Before this check existed, an Ask operation with no
 * owning Skill silently skipped Skill-level feature-flag, kill-switch,
 * adapter-allowlist, result-block-allowlist, and risk-policy enforcement:
 * askOrchestrator.service.ts's executeOperationCore() sets `skill` to
 * `getSkillForOperation(operationId)`, and when that is undefined,
 * `effectivePolicy` is null and the authorization floor falls back to the
 * raw operation definition with none of the Skill contract enforced. That
 * is exactly the gap the 18 BUYER_* operations and INCIDENT_CLAIM_STATUS
 * were in before this phase's buyer-closing/incident-claim Skills. This
 * function makes that class of gap fail startup instead of shipping silently.
 *
 * Only operations with a non-null propertyRoleFloor are in scope. The five
 * null-floor operations (CAPABILITY_DISCOVERY, EMERGENCY_BOUNDARY,
 * GROUNDED_GUIDANCE, OUT_OF_SCOPE_BOUNDARY, UNSAFE_RESTRICTED_BOUNDARY) are
 * orchestrator-native boundary/discovery responses, not Skill-executed
 * domain operations, so they are structurally exempt rather than carved
 * out by name.
 *
 * The exception list was intentionally empty as of this Phase 6 work item:
 * every property-scoped Ask operation was owned by exactly one Skill at
 * that time. The second check below also prevents a future temporary
 * exception from becoming stale documentation.
 *
 * PRODUCTION INCIDENT (2026-09-13): this check went fatal at boot for
 * CAPTURE_FACT_CONFIRM/CAPTURE_EVENT_CONFIRM/CAPTURE_WARRANTY_CONFIRM
 * (Ask Cozy Stage 3, Phase 2/3) -- none of the three ever got an owning
 * Skill, and this Phase 6 check apparently never ran against the full,
 * current operation set in production until this deploy (crashloop, total
 * backend outage). Carved out here as an IMMEDIATE, explicit, documented
 * gap to restore service; a proper owning Skill (or a structural exemption
 * alongside the five null-floor operations above, if these three really
 * are never Skill-routable by design -- they are only ever created
 * programmatically by conversationalCapture.ts, never proposed from a raw
 * homeowner message, mirroring the null-floor boundary operations'
 * "not Skill-executed" shape more than a typical mutation operation's) is
 * real follow-up work, not attempted under incident pressure. Do not let
 * this become stale: the second check below fires the moment any of these
 * three IS given a Skill, forcing this carve-out to be removed then.
 */
export const KNOWN_UNGOVERNED_OPERATIONS: readonly AskOperationId[] = [
  'CAPTURE_FACT_CONFIRM',
  'CAPTURE_EVENT_CONFIRM',
  'CAPTURE_WARRANTY_CONFIRM',
  // Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2;
  // FRD §23's UPLOAD_EVIDENCE resolution). Same non-Skill-executed shape as
  // the three capture operations above -- carved out proactively before
  // ever deploying, learning directly from the production incident
  // documented above rather than repeating it.
  'CAPTURE_EVIDENCE_CONFIRM',
  // Ask Cozy Stage 3, Phase 6 (implementation plan §12; FRD §21). Same shape
  // as the three capture operations above -- learned directly from the
  // production incident documented above, not repeated blind: carved out
  // here PROACTIVELY, before ever deploying, rather than discovering this
  // gap in production again. Only ever created programmatically by
  // conversationalCapture.ts's GOAL candidate processing, never proposed
  // from a raw homeowner message.
  'SELL_HOLD_RENT_GOAL_CAPTURE',
];

export interface SkillOperationGovernanceContext {
  skillCoversOperation: (operationId: AskOperationId) => boolean;
}

export function validateSkillOperationGovernanceCoverage(
  context: SkillOperationGovernanceContext,
  operations: typeof ASK_OPERATION_DEFINITIONS = ASK_OPERATION_DEFINITIONS,
): string[] {
  const issues: string[] = [];
  const knownGaps = new Set<AskOperationId>(KNOWN_UNGOVERNED_OPERATIONS);

  for (const [operationId, definition] of Object.entries(operations) as [AskOperationId, { propertyRoleFloor: unknown }][]) {
    if (definition.propertyRoleFloor === null) continue;
    const covered = context.skillCoversOperation(operationId);
    if (!covered && !knownGaps.has(operationId)) {
      issues.push(`Ask operation "${operationId}" has a property role floor but no owning Skill and is not a documented governance gap in KNOWN_UNGOVERNED_OPERATIONS.`);
    }
    if (covered && knownGaps.has(operationId)) {
      issues.push(`Ask operation "${operationId}" is listed in KNOWN_UNGOVERNED_OPERATIONS but is now covered by a Skill — remove it from the carve-out list.`);
    }
  }

  for (const operationId of knownGaps) {
    if (!(operationId in operations)) issues.push(`KNOWN_UNGOVERNED_OPERATIONS references unknown Ask operation "${operationId}".`);
  }

  return issues;
}
