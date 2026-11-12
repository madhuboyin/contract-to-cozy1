import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../ask/askOperationRegistry';

/**
 * Findings Implementation Plan, Phase 1: the structured exception contract for Ask operations that no Skill owns.
 *
 * This replaces the flat KNOWN_UNGOVERNED_OPERATIONS list. Every operation without an owning Skill has exactly one record here that
 * says how it is entered and governed, why it is acceptable (or why it is a temporary gap), which controls still apply, and, for a
 * temporary gap, who owns closing it and what closes it. The legacy list is derived from this registry (see
 * skillOperationGovernance.contract.ts); there is no second source.
 *
 * The taxonomy describes how an operation is ENTERED and governed, not whether its final effect is a confirmed mutation: that is
 * validated separately through the domain-command and confirm-handler registries. "Internal" (ASK_INTERNAL_OPERATION_IDS) means
 * excluded from fuzzy/semantic message routing; it does NOT mean unreachable from a homeowner message, because a deterministic typed
 * route (resolveAskOperation) can still resolve to an internal operation. DETERMINISTIC_TYPED_ROUTE is therefore its own entry path,
 * and tests/ask/skillGovernanceExceptions.test.js cross-checks every record against the real route table.
 *
 * No operation receives a synthetic Skill merely to make validation pass. An operation that cannot be classified from repository
 * evidence is not given a record by guessing; Phase 1 stops on it and asks for a product/architecture decision instead.
 */
export type SkillGovernanceExceptionClass =
  /** Orchestrator-native boundary/discovery response with no property role floor; never Skill-executed by design. */
  | 'INTENTIONAL_PLATFORM'
  /** Created programmatically by conversational capture, never proposed from a raw homeowner message. */
  | 'INTERNAL_CAPTURE'
  /** Read-only, non-routable, reached only by a launch context that names it. */
  | 'LAUNCH_ONLY'
  /** Read-only and excluded from fuzzy routing, but reachable by an allowlisted deterministic typed route. */
  | 'DETERMINISTIC_TYPED_READ'
  /** Homeowner command excluded from message routing and reached only by the declared entry paths on the record. */
  | 'GOVERNED_INTERNAL_COMMAND'
  /** Message-routable operation without a Skill: a gap with an owner and a removal condition, not an accepted design. */
  | 'TEMPORARY_GAP';

export type SkillGovernanceEntryPath =
  | 'DECLARED_ACTION'
  | 'DETERMINISTIC_TYPED_ROUTE'
  | 'LAUNCH_CONTEXT'
  | 'PROGRAMMATIC_CAPTURE'
  | 'MESSAGE_ROUTING'
  | 'ORCHESTRATOR_BOUNDARY';

export type SkillGovernanceControl =
  /** capabilityInvoke -> invokeGuarded: operational kill switch, property scope, HouseholdRole floor. */
  | 'CAPABILITY_GUARD'
  /** Propose/confirm split through ASK_DOMAIN_COMMAND_REGISTRY and the confirm-handler registry. */
  | 'CONFIRMATION'
  /** The answer-trust validator strips a declared action that is not allowlisted for the operation. */
  | 'DECLARED_ACTION_ALLOWLIST'
  /** Handled by the orchestrator itself (safety/boundary/discovery), outside capability dispatch. */
  | 'ORCHESTRATOR_NATIVE_RESPONSE';

export interface SkillGovernanceException {
  classification: SkillGovernanceExceptionClass;
  reason: string;
  /** The requirement or design the exception rests on. */
  governingReference: string;
  allowedEntryPaths: readonly SkillGovernanceEntryPath[];
  equivalentControls: readonly SkillGovernanceControl[];
  /** Canonical owner (askInteractionCoverageMatrix canonicalOwner). Required for TEMPORARY_GAP and DETERMINISTIC_TYPED_READ. */
  owner?: string;
  /** Required for TEMPORARY_GAP. */
  removalCondition?: string;
}

/** Entry paths each class may declare. A record may not declare a path outside its class. */
export const SKILL_GOVERNANCE_ALLOWED_ENTRY_PATHS: Readonly<Record<SkillGovernanceExceptionClass, readonly SkillGovernanceEntryPath[]>> = Object.freeze({
  INTENTIONAL_PLATFORM: ['ORCHESTRATOR_BOUNDARY', 'MESSAGE_ROUTING'],
  INTERNAL_CAPTURE: ['PROGRAMMATIC_CAPTURE'],
  LAUNCH_ONLY: ['LAUNCH_CONTEXT'],
  DETERMINISTIC_TYPED_READ: ['DETERMINISTIC_TYPED_ROUTE', 'LAUNCH_CONTEXT'],
  GOVERNED_INTERNAL_COMMAND: ['DECLARED_ACTION', 'DETERMINISTIC_TYPED_ROUTE'],
  TEMPORARY_GAP: ['MESSAGE_ROUTING', 'DETERMINISTIC_TYPED_ROUTE', 'DECLARED_ACTION'],
});

type Common = Omit<SkillGovernanceException, 'owner'>;

const registrationIssues: string[] = [];
const records: Partial<Record<AskOperationId, SkillGovernanceException>> = {};

function register(operationIds: readonly AskOperationId[], common: Common, ownerFor?: (operationId: AskOperationId) => string): void {
  for (const operationId of operationIds) {
    if (records[operationId]) {
      registrationIssues.push();
      continue;
    }
    records[operationId] = { ...common, ...(ownerFor ? { owner: ownerFor(operationId) } : {}) };
  }
}

/** The accountable domain owner is the operation's canonical owner: its adapter key, which askInteractionCoverageMatrix restates as canonicalOwner. */
const adapterOwner = (operationId: AskOperationId): string => ASK_OPERATION_DEFINITIONS[operationId].adapterKey;

const COVERAGE_MATRIX = 'askInteractionCoverageMatrix.ts (per-operation note)';
const IW_CONF = 'ASK_COZY_INLINE_WORKSPACE_FRD.md IW-CONF-001';

// 5 orchestrator-native boundary/discovery responses: no property role floor, never Skill-executed.
register([
  'CAPABILITY_DISCOVERY',
  'EMERGENCY_BOUNDARY',
  'GROUNDED_GUIDANCE',
  'OUT_OF_SCOPE_BOUNDARY',
  'UNSAFE_RESTRICTED_BOUNDARY',
], {
  classification: 'INTENTIONAL_PLATFORM',
  reason: 'Orchestrator-native safety, boundary, discovery or grounded-guidance response with no property role floor; it is not a Skill-executed domain operation.',
  governingReference: 'skillOperationGovernance.contract.ts header (null-floor operations are structurally exempt)',
  allowedEntryPaths: ['ORCHESTRATOR_BOUNDARY', 'MESSAGE_ROUTING'],
  equivalentControls: ['ORCHESTRATOR_NATIVE_RESPONSE'],
});

// Conversational capture confirmations: created by conversationalCapture.ts, confirmation-gated.
register([
  'CAPTURE_EVENT_CONFIRM',
  'CAPTURE_EVIDENCE_CONFIRM',
  'CAPTURE_FACT_CONFIRM',
  'CAPTURE_WARRANTY_CONFIRM',
], {
  classification: 'INTERNAL_CAPTURE',
  reason: 'Child confirmation card created programmatically by conversational capture from an extracted candidate; never proposed from a raw homeowner message. Added to the carve-out after a production boot crash (2026-09-13).',
  governingReference: 'services/ask/conversationalUnderstanding/conversationalCapture.ts; ' + IW_CONF,
  allowedEntryPaths: ['PROGRAMMATIC_CAPTURE'],
  equivalentControls: ['CAPABILITY_GUARD', 'CONFIRMATION'],
});

register(['SELL_HOLD_RENT_GOAL_CAPTURE'], {
  classification: 'INTERNAL_CAPTURE',
  reason: 'Created only by conversationalCapture.ts GOAL candidate processing, never proposed from a raw homeowner message; it has no domain command of its own.',
  governingReference: 'services/ask/conversationalUnderstanding/conversationalCapture.ts (GOAL candidate processing)',
  allowedEntryPaths: ['PROGRAMMATIC_CAPTURE'],
  equivalentControls: ['CAPABILITY_GUARD'],
});

// Authored launch-only reads: no input, no recorded home data.
register([
  'HIRING_GUIDE',
  'ITEM_REPAIR_REPLACE_VERDICT',
  'MAINTENANCE_TEMPLATES_BROWSE',
], {
  classification: 'LAUNCH_ONLY',
  reason: 'Read-only, non-routable, reached only by a launch context that names it (a stored starter or a declared browse action); it cannot compete with message-routed operations.',
  governingReference: 'ASK_COZY_EXACT_FOUR_OPPORTUNITY_INVENTORY.md D-O4; ' + COVERAGE_MATRIX,
  allowedEntryPaths: ['LAUNCH_CONTEXT'],
  equivalentControls: ['CAPABILITY_GUARD'],
}, adapterOwner);

// Read-only operations excluded from fuzzy routing but reachable by an allowlisted deterministic typed route.
register([
  'DATA_POINT_READ',
  'HOME_BASICS_GUIDE',
  'NOTIFICATIONS_OVERVIEW',
  'NOTIFICATION_SETTINGS_OVERVIEW',
  'SEASONAL_HOME_CARE',
], {
  classification: 'DETERMINISTIC_TYPED_READ',
  reason: 'Read-only and excluded from fuzzy/semantic routing (ASK_INTERNAL_OPERATION_IDS), but resolveAskOperation resolves it from a deterministic typed pattern, so it is reachable from a homeowner message and must not be described as launch-only.',
  governingReference: 'ASK_COZY_SOLE_HOMEOWNER_INTERFACE_FRD.md (notification conversations); ASK_COZY_EXACT_FOUR_OPPORTUNITY_INVENTORY.md D-O4; ' + COVERAGE_MATRIX,
  allowedEntryPaths: ['DETERMINISTIC_TYPED_ROUTE', 'LAUNCH_CONTEXT'],
  equivalentControls: ['CAPABILITY_GUARD'],
}, adapterOwner);

// Homeowner commands reached only by a declared action.
register([
  'BUYER_CLOSING_DISCLOSURE_COMMAND',
  'BUYER_CLOSING_ITEM_COMMAND',
  'BUYER_CONTRACT_COMMAND',
  'BUYER_INSURANCE_COMMAND',
  'BUYER_LOAN_ESTIMATE_COMMAND',
  'BUYER_PLAN_SETUP_COMMAND',
  'BUYER_WALKTHROUGH_COMMAND',
  'CAPITAL_TIMELINE_COMMAND',
  'CLAIM_ACTIVITY_COMMAND',
  'COVERAGE_ANALYSIS_RUN',
  'COVERAGE_COMMAND',
  'COVERAGE_RECORD_CHECK',
  'COVERAGE_TERM_REVIEW',
  'DIY_PROJECT_NOTE_COMMAND',
  'DIY_SKILL_PROFILE_COMMAND',
  'DO_NOTHING_SCENARIO_COMMAND',
  'DO_NOTHING_SIMULATION_RUN',
  'ENVIRONMENT_REPORT_COMMAND',
  'FINANCING_PROFILE_COMMAND',
  'GUIDANCE_STEP_DECLARE',
  'HOA_COMPLIANCE_COMMAND',
  'HOME_BRIEFING_COMMAND',
  'HOME_BRIEFING_SHARE_COMMAND',
  'HOME_HABITS_GENERATE',
  'HOME_HABIT_PREFERENCES_COMMAND',
  'HOME_HABIT_UPDATE',
  'HOME_JOURNEY_SET',
  'HOME_PLANT_ADD',
  'HOME_RECORD_STATE_COMMAND',
  'HOME_UPGRADE_COMMAND',
  'HOME_WORK_ITEM_COMMAND',
  'INSPECTION_FINDINGS_CHECK',
  'INSPECTION_FINDING_DECISION_COMMAND',
  'INSPECTION_REPORT_COMMAND',
  'INSPECTION_REPORT_REVIEW',
  'MAINTENANCE_EVIDENCE_ATTACH',
  'MATERIAL_SPEC_ADD',
  'NEGOTIATION_SHIELD_BUYER_COMMAND',
  'NEGOTIATION_SHIELD_CASE_ANALYZE',
  'NEGOTIATION_SHIELD_CASE_ATTACH',
  'NEGOTIATION_SHIELD_CASE_UPDATE',
  'NEIGHBORHOOD_INTERACTION_COMMAND',
  'NOTIFICATION_COMMAND',
  'OWNERSHIP_COST_COMMAND',
  'PAST_HAZARD_OUTCOME_COMMAND',
  'PERMIT_TRACKER_COMMAND',
  'PRICE_FINALIZATION_COMMAND',
  'PROPERTY_PURCHASE_DATE_SET',
  'PROPERTY_TAX_APPEAL_COMMAND',
  'PROPERTY_TAX_COMPARABLE_COMMAND',
  'QUOTE_COMPARISON_COMMAND',
  'RENOVATION_READINESS_COMMAND',
  'SAVED_ARCHIVE_COMMAND',
  'SAVINGS_BENEFIT_COMMAND',
  'SEASONAL_CHECKLIST_SETUP',
  'SEASONAL_ITEM_COMMAND',
  'SELLER_PREP_CASE_COMMAND',
  'SERVICE_PRICE_CHECK_RUN',
  'STATUS_BOARD_COMMAND',
  'WORK_REQUEST_COMMAND',
], {
  classification: 'GOVERNED_INTERNAL_COMMAND',
  reason: 'Homeowner command excluded from message routing and reached only from a server-declared action; every write is confirmation-gated through its domain-command entry.',
  governingReference: IW_CONF + '; ' + COVERAGE_MATRIX,
  allowedEntryPaths: ['DECLARED_ACTION'],
  equivalentControls: ['CAPABILITY_GUARD', 'CONFIRMATION', 'DECLARED_ACTION_ALLOWLIST'],
});

// Homeowner commands that a declared action OR a deterministic typed pattern can reach (never fuzzy retrieval).
register([
  'HOME_RECORD_EXPORT_SHARE',
  'MATERIAL_SPEC_UPDATE',
  'NEGOTIATION_SHIELD_CASE_START',
  'NOTIFICATION_SETTINGS_COMMAND',
  'RENOVATION_CASE_START',
], {
  classification: 'GOVERNED_INTERNAL_COMMAND',
  reason: 'Homeowner command excluded from fuzzy routing and reached by a declared action or by a deterministic typed pattern in resolveAskOperation; every write is confirmation-gated through its domain-command entry.',
  governingReference: IW_CONF + '; ' + COVERAGE_MATRIX,
  allowedEntryPaths: ['DECLARED_ACTION', 'DETERMINISTIC_TYPED_ROUTE'],
  equivalentControls: ['CAPABILITY_GUARD', 'CONFIRMATION', 'DECLARED_ACTION_ALLOWLIST'],
});

const REMOVAL_CONDITION = 'Assign exactly one owning Skill, or make the operation non-message-routable through an approved deterministic entry-path classification.';

// Message-routable property-scoped reads with no Skill. Code comments called some of these "deliberately skill-less" without an owner or removal condition.
register([
  'BUYER_INSURANCE_READINESS',
  'BUYER_LOAN_ESTIMATES',
  'COMMUNITY_UPDATES',
  'COVERAGE_REVIEW_STATUS',
  'ENVIRONMENT_REPORT',
  'FINANCING_OVERVIEW',
  'HOME_BRIEFING_VIEW',
  'HOME_RECORD_EXPORT_STATUS',
  'HOME_WORK_ITEMS',
  'HOUSEHOLD_ACCESS_SUMMARY',
  'INSPECTION_REPORTS',
  'PERMIT_TRACKER_STATUS',
  'RECALL_REVIEW',
  'RISK_MITIGATION_PLAN',
  'SAVED_RESULTS',
  'WORK_OVERVIEW',
], {
  classification: 'TEMPORARY_GAP',
  reason: 'Message-routable, property-scoped read with no owning Skill, so it reaches the missing-Skill governance path (no Skill feature flag, allowlist or risk policy) even though it only reads. Earlier carve-out comments described it as deliberately skill-less; no document set an owner or removal condition.',
  governingReference: 'skillOperationGovernance.contract.ts header (HI-SKL-002/HI-SKL-003); ' + COVERAGE_MATRIX,
  allowedEntryPaths: ['MESSAGE_ROUTING', 'DETERMINISTIC_TYPED_ROUTE'],
  equivalentControls: ['CAPABILITY_GUARD'],
  removalCondition: REMOVAL_CONDITION,
}, adapterOwner);

// The same reads that no deterministic typed pattern reaches: only fuzzy/semantic message routing resolves them.
register([
  'CLAIM_CHECKLIST_VIEW',
  'INSPECTION_NEGOTIATION_PACKAGE',
  'INSPECTION_REPORT_COMPARE',
  'INSPECTION_REPORT_FINDINGS',
], {
  classification: 'TEMPORARY_GAP',
  reason: 'Message-routable, property-scoped read with no owning Skill, so it reaches the missing-Skill governance path (no Skill feature flag, allowlist or risk policy) even though it only reads. Earlier carve-out comments described it as deliberately skill-less; no document set an owner or removal condition.',
  governingReference: 'skillOperationGovernance.contract.ts header (HI-SKL-002/HI-SKL-003); ' + COVERAGE_MATRIX,
  allowedEntryPaths: ['MESSAGE_ROUTING'],
  equivalentControls: ['CAPABILITY_GUARD'],
  removalCondition: REMOVAL_CONDITION,
}, adapterOwner);

// Message-routable confirmation-gated commands with no Skill. Confirmation protects the write; it does not replace Skill-level governance.
register([
  'HOME_RECORD_EXPORT',
  'RECALL_MATCH_UPDATE',
  'ROOM_PLANT_RECOMMENDATIONS',
], {
  classification: 'TEMPORARY_GAP',
  reason: 'Message-routable confirmation-gated command with no owning Skill. Confirmation protects the write but does not replace Skill-level feature flags, allowlists, risk policy or routing ownership.',
  governingReference: 'skillOperationGovernance.contract.ts header (HI-SKL-002/HI-SKL-003); ' + COVERAGE_MATRIX,
  allowedEntryPaths: ['MESSAGE_ROUTING', 'DETERMINISTIC_TYPED_ROUTE', 'DECLARED_ACTION'],
  equivalentControls: ['CAPABILITY_GUARD', 'CONFIRMATION'],
  removalCondition: REMOVAL_CONDITION,
}, adapterOwner);

export const SKILL_GOVERNANCE_EXCEPTIONS: Readonly<Partial<Record<AskOperationId, SkillGovernanceException>>> = Object.freeze(records);
export const SKILL_GOVERNANCE_EXCEPTION_REGISTRATION_ISSUES: readonly string[] = Object.freeze([...registrationIssues]);
