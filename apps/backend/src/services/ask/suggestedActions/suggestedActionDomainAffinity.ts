// Reviewed, deterministic domain affinity for exact-four ordering. Affinity is a TIEBREAKER only: it never admits, removes or
// re-classes a candidate, and it never outranks the keys each slot class already orders by (profile materiality; opportunity
// ownership and goal; starter rotation). It is data, not parsing: no operation name is inspected at runtime.
//
// An operation that is not listed has no domain, so it earns no affinity and ordering falls through to the shared deterministic order.
// The LOCATION profile area is deliberately absent: it is unreachable from the actionable-profile producer (location identity fields
// stay in the home record and use separate correction paths), so no affinity is invented for it.
import type { AskOperationId } from '../askOperationRegistry';
import type { SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import { profileAreaForOutcome, type ProfileArea } from './actionableProfileRegistry';

export const SUGGESTED_ACTION_DOMAIN_AFFINITY_VERSION = 'sna-domain-affinity-1';

export const SUGGESTED_ACTION_DOMAINS = ['MAINTENANCE', 'INSPECTION', 'COVERAGE', 'FINANCE', 'SAFETY', 'HOME_RECORD', 'SEASONAL', 'GUIDANCE'] as const;
export type SuggestedActionDomain = typeof SUGGESTED_ACTION_DOMAINS[number];

const group = (domain: SuggestedActionDomain, operations: readonly AskOperationId[]): [AskOperationId, SuggestedActionDomain][] => operations.map((operation) => [operation, domain]);

/** The domain an operation belongs to, for both the CURRENT operation and a candidate's destination operation. One domain per operation. */
export const OPERATION_DOMAINS: Readonly<Partial<Record<AskOperationId, SuggestedActionDomain>>> = Object.freeze(Object.fromEntries([
  ...group('MAINTENANCE', [
    'MAINTENANCE_BUDGET_FORECAST', 'MAINTENANCE_EVIDENCE_ATTACH', 'MAINTENANCE_FORECAST', 'MAINTENANCE_STATUS', 'MAINTENANCE_TASK_COMPLETE',
    'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_UPDATE', 'MAINTENANCE_TEMPLATES_BROWSE', 'APPLIANCE_FAILURE_RISK', 'REPLACEMENT_GUIDANCE',
    'HVAC_DECISION_ABANDON', 'HVAC_DECISION_CONTINUE', 'HVAC_DECISION_OUTCOME_REPORT', 'HVAC_DECISION_OUTCOME_UNLINK', 'HVAC_DECISION_OUTCOME_VIEW',
    'HVAC_DECISION_SCENARIO', 'HVAC_DECISION_START', 'HVAC_PREFERENCE_FORGET', 'HVAC_PREFERENCE_SAVE', 'HVAC_SPECIALIST_ENGAGE',
    'INVENTORY_ITEM_CORRECT', 'INVENTORY_ITEM_CREATE', 'INVENTORY_LOOKUP',
  ]),
  ...group('INSPECTION', [
    'INSPECTION_FINDINGS', 'INSPECTION_FINDINGS_CHECK', 'INSPECTION_FINDING_DECISION_COMMAND', 'INSPECTION_FINDING_UPDATE', 'INSPECTION_NEGOTIATION_PACKAGE',
    'INSPECTION_REPORTS', 'INSPECTION_REPORT_COMMAND', 'INSPECTION_REPORT_COMPARE', 'INSPECTION_REPORT_FINDINGS', 'INSPECTION_REPORT_REVIEW',
  ]),
  ...group('COVERAGE', [
    'WARRANTY_LOOKUP', 'WARRANTY_UPDATE', 'CAPTURE_WARRANTY_CONFIRM', 'COVERAGE_ANALYSIS_RUN', 'COVERAGE_COMMAND', 'COVERAGE_COMPARISON_STATUS',
    'COVERAGE_GAPS', 'COVERAGE_RECORD_CHECK', 'COVERAGE_REVIEW_STATUS', 'COVERAGE_TERM_REVIEW', 'CLAIM_ACTIVITY_COMMAND', 'CLAIM_CHECKLIST_VIEW',
    'CLAIM_FILE', 'CLAIM_TRANSITION', 'INCIDENT_CLAIM_STATUS',
  ]),
  ...group('FINANCE', [
    'CAPITAL_RESERVE_PLAN', 'CAPITAL_TIMELINE_COMMAND', 'RESERVE_FUND_COMMAND', 'BREAK_EVEN_ANALYSIS', 'FINANCING_OVERVIEW', 'FINANCING_PROFILE_COMMAND',
    'OWNERSHIP_COSTS', 'OWNERSHIP_COST_COMMAND', 'REFINANCE_ANALYSIS', 'REFINANCE_COMMAND', 'REFINANCE_RATE_MONITOR', 'SAVINGS_BENEFIT_COMMAND',
    'SAVINGS_OPPORTUNITIES', 'SELL_HOLD_RENT_ANALYSIS', 'SELL_HOLD_RENT_COMMAND', 'DO_NOTHING_SIMULATION', 'DO_NOTHING_SIMULATION_RUN', 'DO_NOTHING_SCENARIO_COMMAND',
    'QUOTE_COMPARISON_COMMAND', 'QUOTE_COMPARISON_CREATE', 'QUOTE_COMPARISON_REVIEW', 'SERVICE_PRICE_CHECKS', 'SERVICE_PRICE_CHECK_RUN',
  ]),
  ...group('SAFETY', ['RECALL_MATCH_UPDATE', 'RECALL_REVIEW', 'RISK_MITIGATION_PLAN', 'EMERGENCY_BOUNDARY', 'PAST_HAZARD_EXPOSURE', 'PAST_HAZARD_OUTCOME_COMMAND']),
  ...group('HOME_RECORD', [
    'PROPERTY_SUMMARY', 'DOCUMENT_LOOKUP', 'HOME_RECORD_EXPORT', 'HOME_RECORD_EXPORT_SHARE', 'HOME_RECORD_EXPORT_STATUS', 'HOME_RECORD_STATE_COMMAND',
    'PROPERTY_CONTEXT_AREA_CAPTURE', 'PROPERTY_PURCHASE_DATE_SET', 'CAPTURE_FACT_CONFIRM', 'ROOM_CREATE', 'ROOM_RENAME',
  ]),
  ...group('SEASONAL', ['SEASONAL_HOME_CARE', 'SEASONAL_CHECKLIST_SETUP', 'SEASONAL_ITEM_COMMAND']),
  ...group('GUIDANCE', ['HOME_BASICS_GUIDE', 'HIRING_GUIDE', 'GROUNDED_GUIDANCE', 'GUIDANCE_JOURNEYS_LIST', 'GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEY_CREATE']),
] as [string, SuggestedActionDomain][]));

/**
 * Domains in which a current result makes a profile-area capture more relevant. PROPERTY_CONTEXT_AREA_CAPTURE is one operation, so
 * its candidates are told apart by area (outcomeKey), not by operation. LOCATION is intentionally unmapped.
 */
export const PROFILE_AREA_DOMAINS: Readonly<Partial<Record<ProfileArea, readonly SuggestedActionDomain[]>>> = Object.freeze({
  CORE: Object.freeze<SuggestedActionDomain[]>(['HOME_RECORD']),
  STRUCTURE: Object.freeze<SuggestedActionDomain[]>(['INSPECTION', 'MAINTENANCE']),
  EXTERIOR: Object.freeze<SuggestedActionDomain[]>(['MAINTENANCE', 'SEASONAL']),
  RESPONSIBILITY: Object.freeze<SuggestedActionDomain[]>(['MAINTENANCE', 'COVERAGE']),
  SYSTEMS: Object.freeze<SuggestedActionDomain[]>(['MAINTENANCE', 'FINANCE']),
  SAFETY: Object.freeze<SuggestedActionDomain[]>(['SAFETY', 'SEASONAL']),
});

/**
 * 1 when the trusted current operation's domain matches the candidate, else 0. A profile-area capture matches through its area's
 * domains; any other candidate (home opportunity, curated starter) matches through its destination operation's own domain.
 * The current operation comes from the finalizer's trusted execution, never from a candidate.
 */
export function domainAffinity(currentOperationId: string | null | undefined, candidate: SuggestedNextActionCandidate): 0 | 1 {
  if (!currentOperationId) return 0;
  const current = OPERATION_DOMAINS[currentOperationId as AskOperationId];
  if (!current) return 0;
  if (candidate.operationId === 'PROPERTY_CONTEXT_AREA_CAPTURE') {
    const area = profileAreaForOutcome(candidate.outcomeKey);
    return area && PROFILE_AREA_DOMAINS[area]?.includes(current) ? 1 : 0;
  }
  return OPERATION_DOMAINS[candidate.operationId as AskOperationId] === current ? 1 : 0;
}
