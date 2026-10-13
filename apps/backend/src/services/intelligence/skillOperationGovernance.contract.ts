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
  // Ask Cozy conversational UI gap audit, Group B (FRD v1.162-v1.163).
  // RECALL_REVIEW (commit bbcb06c2) and RECALL_MATCH_UPDATE (commit b93ab08a)
  // are deliberately skill-less, same precedent as CAPTURE_FACT_CONFIRM:
  // read/confirmation-gated operations with no Skill package. Missing from
  // this list crash-looped production at boot (2026-09-29).
  'RECALL_REVIEW',
  'RECALL_MATCH_UPDATE',
  // Exact-four starter source (inventory D-O4/D-O16): a non-routable, launch-only, data-independent read. Deliberately skill-less, the
  // same precedent as RECALL_REVIEW above; it must stay in this list or the boot-time governance check fails.
  'SEASONAL_HOME_CARE',
  // Home Habit Coach review actions (add to routine, mark done, snooze, skip, dismiss): confirmation-gated, non-routable, declared-action only.
  // Deliberately skill-less, the same precedent as RECALL_MATCH_UPDATE above (the home-habit-coach skill stays a READ skill); it must stay in
  // this list or the boot-time governance check fails.
  'HOME_HABIT_UPDATE',
  // Seasonal checklist setup (owner-only, confirmation-gated, declared-action only): skill-less like SEASONAL_HOME_CARE, which launches it.
  // It must stay in this list or the boot-time governance check fails.
  'SEASONAL_CHECKLIST_SETUP',
  // Property settings written inside Ask (the purchase date, the home journey): owner-declared actions, confirmation-gated, skill-less. They must
  // stay in this list or the boot-time governance check fails.
  'PROPERTY_PURCHASE_DATE_SET',
  // Recommended maintenance tasks (launch-only read, skill-less like the other declared-action reads). It must stay in this list or the boot check fails.
  'MAINTENANCE_TEMPLATES_BROWSE',
  'HOME_JOURNEY_SET',
  // Material and plant adds written inside Ask (declared-action, confirmation-gated, skill-less).
  'MATERIAL_SPEC_ADD',
  'HOME_PLANT_ADD',
  // Negotiation Shield review start (declared-action, confirmation-gated, skill-less; the negotiation-shield skill stays a READ skill, the same
  // precedent as HOME_HABIT_UPDATE above). It must stay in this list or the boot-time governance check fails.
  'NEGOTIATION_SHIELD_CASE_START',
  // Negotiation Shield analysis run (declared-action, confirmation-gated, skill-less like the start above). It must stay in this list or the boot check fails.
  'NEGOTIATION_SHIELD_CASE_ANALYZE',
  // Negotiation Shield saved-details edit (declared-action, confirmation-gated, skill-less like the two above). It must stay in this list or the boot check fails.
  'NEGOTIATION_SHIELD_CASE_UPDATE',
  // Negotiation Shield document attach (declared-action, confirmation-gated, skill-less like the three above). It must stay in this list or the boot check fails.
  'NEGOTIATION_SHIELD_CASE_ATTACH',
  // Renovation case start (declared-action or typed, confirmation-gated, skill-less like the readiness read's neighbours). It must stay in this list or the boot check fails.
  'RENOVATION_CASE_START',
  'HOME_RECORD_STATE_COMMAND',
  'BUYER_CONTRACT_COMMAND',
  'BUYER_INSURANCE_COMMAND',
  'BUYER_INSURANCE_READINESS',
  'BUYER_CLOSING_ITEM_COMMAND',
  'BUYER_WALKTHROUGH_COMMAND',
  'DIY_PROJECT_NOTE_COMMAND',
  'DIY_SKILL_PROFILE_COMMAND',
  'SEASONAL_ITEM_COMMAND',
  'HOME_WORK_ITEM_COMMAND',
  'HOME_WORK_ITEMS',
  'INSPECTION_NEGOTIATION_PACKAGE',
  'INSPECTION_FINDING_DECISION_COMMAND',
  'INSPECTION_REPORT_FINDINGS',
  'INSPECTION_REPORT_COMMAND',
  'INSPECTION_REPORT_COMPARE',
  'INSPECTION_REPORTS',
  'SELLER_PREP_CASE_COMMAND',
  'CLAIM_ACTIVITY_COMMAND',
  'CLAIM_CHECKLIST_VIEW',
  'DO_NOTHING_SCENARIO_COMMAND',
  'HOME_HABIT_PREFERENCES_COMMAND',
  'FINANCING_PROFILE_COMMAND',
  'HOME_BRIEFING_SHARE_COMMAND',
  'HOA_COMPLIANCE_COMMAND',
  'HOME_BRIEFING_COMMAND',
  'HOME_BRIEFING_VIEW',
  'NEIGHBORHOOD_INTERACTION_COMMAND',
  'PAST_HAZARD_OUTCOME_COMMAND',
  'RENOVATION_READINESS_COMMAND',
  'SAVINGS_BENEFIT_COMMAND',
  'PROPERTY_TAX_APPEAL_COMMAND',
  'STATUS_BOARD_COMMAND',
  'CAPITAL_TIMELINE_COMMAND',
  'COVERAGE_COMMAND',
  'COVERAGE_REVIEW_STATUS',
  'HOME_UPGRADE_COMMAND',
  'PERMIT_TRACKER_COMMAND',
  'FINANCING_OVERVIEW',
  'PERMIT_TRACKER_STATUS',
  'NEGOTIATION_SHIELD_BUYER_COMMAND',
  'PRICE_FINALIZATION_COMMAND',
  'QUOTE_COMPARISON_COMMAND',
  'ROOM_PLANT_RECOMMENDATIONS',
  'OWNERSHIP_COST_COMMAND',
  // Tool starts written inside Ask (declared-action, confirmation-gated, skill-less): suggest habits, run the simulation, check a quote.
  'HOME_HABITS_GENERATE',
  'DO_NOTHING_SIMULATION_RUN',
  'SERVICE_PRICE_CHECK_RUN',
  // Exact-four starter source (inventory D-O4): authored, non-routable, launch-only; skill-less like SEASONAL_HOME_CARE.
  'HOME_BASICS_GUIDE',
  // Exact-four starter source (inventory D-O4): authored, non-routable, launch-only; skill-less like the two above.
  'HIRING_GUIDE',
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
