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
 * KNOWN_UNGOVERNED_OPERATIONS documents a real, current gap, not a
 * placeholder: GUIDANCE_JOURNEY_CREATE and HOME_CHANGE_SUMMARY are fully
 * implemented and orchestrator-routed but predate Skill governance and are
 * outside this phase's named scope (HI-SKL-003: Claims, buyer/closing,
 * inspection, incident/emergency, document review/promotion, Operational
 * Work). Governing them is open follow-up work — see the FRD Phase 6
 * status note. The second check below fails startup if either entry stops
 * being a real gap, so this list cannot rot into stale documentation.
 */
export const KNOWN_UNGOVERNED_OPERATIONS: readonly AskOperationId[] = [
  'GUIDANCE_JOURNEY_CREATE',
  'HOME_CHANGE_SUMMARY',
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
