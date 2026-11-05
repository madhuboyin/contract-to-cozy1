import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../ask/askOperationRegistry';
import { getAskDomainCommandByOperation, type AskDomainCommandDefinition } from '../ask/askDomainCommandRegistry';
import {
  SKILL_GOVERNANCE_ALLOWED_ENTRY_PATHS,
  SKILL_GOVERNANCE_EXCEPTIONS,
  SKILL_GOVERNANCE_EXCEPTION_REGISTRATION_ISSUES,
  type SkillGovernanceException,
} from './skillGovernanceExceptions.contract';

export {
  SKILL_GOVERNANCE_EXCEPTIONS,
  type SkillGovernanceException,
  type SkillGovernanceExceptionClass,
} from './skillGovernanceExceptions.contract';

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
 *
 * Findings Implementation Plan, Phase 1: the flat carve-out list was replaced by the structured SKILL_GOVERNANCE_EXCEPTIONS registry
 * (skillGovernanceExceptions.contract.ts), which classifies every Skill-less operation by entry path and governance. The list below
 * is derived from it and kept only for existing consumers; it is not a second source.
 */
export const KNOWN_UNGOVERNED_OPERATIONS: readonly AskOperationId[] = (Object.keys(SKILL_GOVERNANCE_EXCEPTIONS) as AskOperationId[])
  .filter((operationId) => ASK_OPERATION_DEFINITIONS[operationId]?.propertyRoleFloor !== null)
  .sort();

export interface SkillOperationGovernanceContext {
  skillCoversOperation: (operationId: AskOperationId) => boolean;
}

export interface SkillOperationGovernanceOptions {
  exceptions?: Readonly<Partial<Record<AskOperationId, SkillGovernanceException>>>;
  commandForOperation?: (operationId: string) => AskDomainCommandDefinition | null;
  registrationIssues?: readonly string[];
}

type OperationShape = {
  propertyRoleFloor: unknown;
  messageRoutable: boolean;
  executionMode: string;
};

const nonEmpty = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

export function validateSkillOperationGovernanceCoverage(
  context: SkillOperationGovernanceContext,
  operations: typeof ASK_OPERATION_DEFINITIONS = ASK_OPERATION_DEFINITIONS,
  options: SkillOperationGovernanceOptions = {},
): string[] {
  const exceptions = options.exceptions ?? SKILL_GOVERNANCE_EXCEPTIONS;
  const commandForOperation = options.commandForOperation ?? getAskDomainCommandByOperation;
  const issues: string[] = [...(options.registrationIssues ?? SKILL_GOVERNANCE_EXCEPTION_REGISTRATION_ISSUES)];

  for (const [operationId, definition] of Object.entries(operations) as [AskOperationId, OperationShape][]) {
    const covered = context.skillCoversOperation(operationId);
    const record = exceptions[operationId];
    if (!covered && !record) {
      issues.push(`Ask operation "${operationId}" has no owning Skill and no skill governance exception record in SKILL_GOVERNANCE_EXCEPTIONS.`);
    }
    if (covered && record) {
      issues.push(`Ask operation "${operationId}" has a skill governance exception record but is now covered by a Skill -- remove the record.`);
    }
    if (!covered && record) issues.push(...validateExceptionRecord(operationId, definition, record, commandForOperation));
  }

  for (const operationId of Object.keys(exceptions)) {
    if (!(operationId in operations)) issues.push(`SKILL_GOVERNANCE_EXCEPTIONS references unknown Ask operation "${operationId}".`);
  }

  return issues;
}

function validateExceptionRecord(
  operationId: AskOperationId,
  definition: OperationShape,
  record: SkillGovernanceException,
  commandForOperation: (operationId: string) => AskDomainCommandDefinition | null,
): string[] {
  const issues: string[] = [];
  const label = `Ask operation "${operationId}" (${record.classification})`;
  const command = commandForOperation(operationId);
  const hasFloor = definition.propertyRoleFloor !== null;

  if (!nonEmpty(record.reason)) issues.push(`${label}: exception record has no reason.`);
  if (!nonEmpty(record.governingReference)) issues.push(`${label}: exception record has no governing reference.`);
  if (record.allowedEntryPaths.length === 0) issues.push(`${label}: exception record declares no allowed entry path.`);
  if (record.equivalentControls.length === 0) issues.push(`${label}: exception record declares no equivalent controls.`);
  const classPaths = SKILL_GOVERNANCE_ALLOWED_ENTRY_PATHS[record.classification];
  if (!classPaths) {
    issues.push(`${label}: unknown exception classification.`);
    return issues;
  }
  for (const entryPath of record.allowedEntryPaths) {
    if (!classPaths.includes(entryPath)) issues.push(`${label}: entry path ${entryPath} is not allowed for this classification.`);
  }

  if (record.classification === 'INTENTIONAL_PLATFORM') {
    if (hasFloor) issues.push(`${label}: only an operation with no property role floor can be an intentional platform exception.`);
    return issues;
  }

  if (!hasFloor) issues.push(`${label}: an operation with no property role floor is a platform boundary, not ${record.classification}.`);

  if (record.classification === 'TEMPORARY_GAP') {
    if (!definition.messageRoutable) issues.push(`${label}: a non-message-routable operation is not a temporary gap; classify its actual entry path.`);
    if (!nonEmpty(record.owner)) issues.push(`${label}: a temporary gap needs an owner.`);
    if (!nonEmpty(record.removalCondition)) issues.push(`${label}: a temporary gap needs a removal condition.`);
    if (command && !record.equivalentControls.includes('CONFIRMATION')) issues.push(`${label}: a command exception must declare its confirmation control.`);
    return issues;
  }

  if (definition.messageRoutable) {
    issues.push(`${label}: an internal, launch-only, or capture exception must not be message-routable; reclassify it or add an owning Skill.`);
  }

  if (record.classification === 'GOVERNED_INTERNAL_COMMAND') {
    if (!command) issues.push(`${label}: a governed internal command needs exactly one ASK_DOMAIN_COMMAND_REGISTRY entry.`);
    if (!record.equivalentControls.includes('CONFIRMATION')) issues.push(`${label}: a governed internal command must declare its confirmation control.`);
    if (!record.allowedEntryPaths.includes('DECLARED_ACTION')) issues.push(`${label}: a governed internal command must declare DECLARED_ACTION as an entry path.`);
  } else if (record.classification === 'INTERNAL_CAPTURE') {
    if (!record.allowedEntryPaths.includes('PROGRAMMATIC_CAPTURE')) issues.push(`${label}: a capture exception must declare PROGRAMMATIC_CAPTURE.`);
    if (command && !record.equivalentControls.includes('CONFIRMATION')) issues.push(`${label}: a capture operation with a domain command must declare its confirmation control.`);
  } else {
    // LAUNCH_ONLY and DETERMINISTIC_TYPED_READ are reads: no domain command, no confirmation adapter.
    if (command) issues.push(`${label}: a read-only exception must not have a domain command.`);
    if (record.equivalentControls.includes('CONFIRMATION')) issues.push(`${label}: a read-only exception must not declare a confirmation control.`);
    if (record.classification === 'LAUNCH_ONLY' && record.allowedEntryPaths.some((entryPath) => entryPath !== 'LAUNCH_CONTEXT')) {
      issues.push(`${label}: launch-only means LAUNCH_CONTEXT is the only entry path; a typed route needs DETERMINISTIC_TYPED_READ.`);
    }
    if (record.classification === 'DETERMINISTIC_TYPED_READ') {
      if (!record.allowedEntryPaths.includes('DETERMINISTIC_TYPED_ROUTE')) issues.push(`${label}: a deterministic typed read must declare DETERMINISTIC_TYPED_ROUTE.`);
      if (definition.executionMode !== 'DETERMINISTIC') issues.push(`${label}: a deterministic typed read must have a DETERMINISTIC execution mode.`);
      if (!nonEmpty(record.owner)) issues.push(`${label}: a deterministic typed read needs an explicit canonical owner.`);
    }
  }
  return issues;
}
