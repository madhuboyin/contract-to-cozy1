import type { AskCaptureRequest, AskClarification, AskConfirmation, AskExecutionStatus, AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import type { SkillHandoffSuggestion } from '../skills/skillHandoff';
import { createAskOperationSemanticContract, validateAskSemanticContract, type AskOperationSemanticContract } from './askTrust.contract';
import { validateAskOperationSemanticPackages } from './askOperationSemanticPackages';

export type AskIntentFamily =
  | 'RECORD_QUERY'
  | 'STATUS_SUMMARY'
  | 'DECISION_ANALYSIS'
  | 'CAPABILITY_DISCOVERY'
  | 'WORKFLOW_GUIDANCE'
  | 'COMMAND'
  | 'MONITOR'
  | 'GENERAL_HOME_GUIDANCE'
  | 'CLARIFICATION'
  | 'OUT_OF_SCOPE'
  | 'UNSAFE_OR_RESTRICTED';

export type AskOperationId =
  | 'MAINTENANCE_STATUS'
  | 'MAINTENANCE_TASK_CREATE'
  | 'MAINTENANCE_TASK_COMPLETE'
  | 'MAINTENANCE_TASK_UPDATE'
  | 'COVERAGE_GAPS'
  | 'INCIDENT_CLAIM_STATUS'
  | 'SAVINGS_OPPORTUNITIES'
  | 'OWNERSHIP_COSTS'
  | 'INVENTORY_LOOKUP'
  | 'PROPERTY_SUMMARY'
  | 'HOME_ACTIONS'
  | 'CAPABILITY_DISCOVERY'
  | 'REPLACEMENT_GUIDANCE'
  | 'REFINANCE_ANALYSIS'
  | 'REFINANCE_RATE_MONITOR'
  | 'SELL_HOLD_RENT_ANALYSIS'
  | 'HOUSEHOLD_INVITATION'
  | 'GUIDANCE_JOURNEY_CREATE'
  | 'QUOTE_COMPARISON_CREATE'
  | 'QUOTE_COMPARISON_REVIEW'
  | 'HOME_DEADLINE_MONITOR'
  | 'CAPITAL_RESERVE_PLAN'
  | 'PROPERTY_TAX_APPEAL_READINESS'
  | 'RENOVATION_PERMIT_READINESS'
  | 'MAJOR_EVENT_ENTRY'
  | 'EMERGENCY_BOUNDARY'
  | 'UNSAFE_RESTRICTED_BOUNDARY'
  | 'OUT_OF_SCOPE_BOUNDARY'
  | 'GROUNDED_GUIDANCE'
  | 'HVAC_DECISION_START'
  | 'HVAC_DECISION_CONTINUE'
  | 'HVAC_DECISION_SCENARIO'
  | 'HVAC_DECISION_ABANDON'
  | 'HVAC_PREFERENCE_SAVE'
  | 'HVAC_PREFERENCE_FORGET'
  | 'HOME_CHANGE_SUMMARY'
  | 'HVAC_DECISION_OUTCOME_REPORT'
  | 'HVAC_DECISION_OUTCOME_VIEW'
  | 'HVAC_DECISION_OUTCOME_UNLINK'
  // Home Buyer FRD §13.3 — buyer closing copilot operations. Distinct from
  // HOME_ACTIONS/COVERAGE_GAPS/OWNERSHIP_COSTS/PROPERTY_SUMMARY: those remain
  // the homeowner-facing operations, while these read and operate the
  // canonical Buyer Plan (HomeBuyerChecklist/HomeBuyerTask) for a pre-close
  // purchase property. A non-buyer property gracefully explains that instead
  // of pretending to answer (see buyerPlanContextProvider gating).
  | 'BUYER_PLAN_STATUS'
  | 'BUYER_DEADLINES'
  | 'BUYER_DOCUMENT_READINESS'
  | 'BUYER_INSPECTION_REVIEW'
  | 'BUYER_TASK_COMPLETE'
  | 'BUYER_TASK_CREATE'
  | 'BUYER_TASK_UPDATE'
  | 'BUYER_MOVE_STATUS'
  | 'BUYER_FINANCING_READINESS'
  | 'BUYER_TITLE_ESCROW_READINESS'
  | 'BUYER_WALKTHROUGH_READINESS'
  | 'BUYER_DISCLOSURE_FUNDS_READINESS'
  | 'BUYER_CLOSING_DAY_READINESS'
  | 'BUYER_CONTRACT_TIMELINE'
  | 'BUYER_NEGOTIATION_READINESS'
  | 'BUYER_COST_READINESS'
  | 'BUYER_FINDING_DISPOSITION'
  | 'BUYER_LIFECYCLE_UPDATE';

export interface AskOperationResolution {
  operationId: AskOperationId;
  version: string;
  family: AskIntentFamily;
  confidence: number;
  requiresProperty: boolean;
}

export type AskExecutionMode = 'DETERMINISTIC' | 'REMOTE_GENERATION';
export type AskSafetyClass = 'STANDARD' | 'MATERIAL_DECISION' | 'EMERGENCY_BOUNDARY' | 'UNSAFE_RESTRICTED_BOUNDARY' | 'OUT_OF_SCOPE_BOUNDARY';
export type AskPropertyRoleFloor = 'VIEWER' | 'CONTRIBUTOR' | 'OWNER' | null;

export interface AskOperationDefinition extends AskOperationResolution {
  executionMode: AskExecutionMode;
  safetyClass: AskSafetyClass;
  propertyRoleFloor: AskPropertyRoleFloor;
  adapterKey: string;
  allowedBlockTypes: AskPresentationBlock['type'][];
  evalSuite: string;
  semantic: AskOperationSemanticContract;
}

export interface AskOperationResult {
  status: AskExecutionStatus;
  reasonCode?: string;
  contextVersion?: string | null;
  blocks: AskPresentationBlock[];
  captureRequests?: AskCaptureRequest[];
  clarification?: AskClarification | null;
  confirmation?: AskConfirmation | null;
  suggestions: string[];
  skillHandoff?: SkillHandoffSuggestion | null;
  parameters?: Record<string, unknown>;
}

const CAPABILITY_CONTINUITY_OPERATIONS = new Set<AskOperationId>([
  'MAINTENANCE_STATUS', 'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_COMPLETE',
  'MAINTENANCE_TASK_UPDATE', 'GUIDANCE_JOURNEY_CREATE', 'QUOTE_COMPARISON_CREATE', 'QUOTE_COMPARISON_REVIEW', 'HOME_DEADLINE_MONITOR',
  'CAPITAL_RESERVE_PLAN', 'PROPERTY_TAX_APPEAL_READINESS', 'RENOVATION_PERMIT_READINESS', 'MAJOR_EVENT_ENTRY',
  'COVERAGE_GAPS', 'SAVINGS_OPPORTUNITIES', 'OWNERSHIP_COSTS', 'INVENTORY_LOOKUP',
  'PROPERTY_SUMMARY', 'HOME_ACTIONS', 'REPLACEMENT_GUIDANCE', 'REFINANCE_ANALYSIS',
  'REFINANCE_RATE_MONITOR', 'SELL_HOLD_RENT_ANALYSIS',
]);

const definition = (
  operationId: AskOperationId,
  family: AskIntentFamily,
  requiresProperty: boolean,
  executionMode: AskExecutionMode,
  safetyClass: AskSafetyClass,
  propertyRoleFloor: AskPropertyRoleFloor,
  adapterKey: string,
  allowedBlockTypes: AskPresentationBlock['type'][],
): AskOperationDefinition => {
  const base = {
    operationId,
    version: '1.0',
    family,
    confidence: 1,
    requiresProperty,
    executionMode,
    safetyClass,
    propertyRoleFloor,
    adapterKey,
    allowedBlockTypes: CAPABILITY_CONTINUITY_OPERATIONS.has(operationId)
      ? [...new Set([...allowedBlockTypes, 'CAPABILITY_LIST' as const])]
      : allowedBlockTypes,
    evalSuite: `ask-${operationId.toLowerCase().replace(/_/g, '-')}-golden`,
  } satisfies Omit<AskOperationDefinition, 'semantic'>;
  return { ...base, semantic: createAskOperationSemanticContract(base) };
};

export const ASK_OPERATION_DEFINITIONS: Readonly<Record<AskOperationId, AskOperationDefinition>> = Object.freeze({
  MAINTENANCE_STATUS: definition('MAINTENANCE_STATUS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'maintenance.status', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  MAINTENANCE_TASK_CREATE: definition('MAINTENANCE_TASK_CREATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'maintenance.create', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  MAINTENANCE_TASK_COMPLETE: definition('MAINTENANCE_TASK_COMPLETE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'maintenance.complete', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  MAINTENANCE_TASK_UPDATE: definition('MAINTENANCE_TASK_UPDATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'maintenance.update', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS']),
  COVERAGE_GAPS: definition('COVERAGE_GAPS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'coverage.review', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'BOUNDARY']),
  INCIDENT_CLAIM_STATUS: definition('INCIDENT_CLAIM_STATUS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'incident-claim.status', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE']),
  SAVINGS_OPPORTUNITIES: definition('SAVINGS_OPPORTUNITIES', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'savings.opportunities', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE']),
  OWNERSHIP_COSTS: definition('OWNERSHIP_COSTS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'ownership.costs', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  INVENTORY_LOOKUP: definition('INVENTORY_LOOKUP', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'inventory.lookup', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE']),
  PROPERTY_SUMMARY: definition('PROPERTY_SUMMARY', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'property.summary', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE']),
  // Phase 9B (FRD §17/§21.2) adds PRIORITY_LIST as an additive, versioned
  // explainable annotation of this same operation's existing feed read --
  // deliberately not a new operation, so Ask never presents two ranked
  // views of Home Actions (FRD Phase 9B exit criterion: "no competing
  // action source").
  HOME_ACTIONS: definition('HOME_ACTIONS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'home-actions.feed', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'PRIORITY_LIST', 'BOUNDARY']),
  CAPABILITY_DISCOVERY: definition('CAPABILITY_DISCOVERY', 'CAPABILITY_DISCOVERY', false, 'DETERMINISTIC', 'STANDARD', null, 'capability.discovery', ['SUMMARY', 'CAPABILITY_LIST']),
  REPLACEMENT_GUIDANCE: definition('REPLACEMENT_GUIDANCE', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'inventory.replacement', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  REFINANCE_ANALYSIS: definition('REFINANCE_ANALYSIS', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'refinance.analysis', ['SUMMARY', 'TABLE', 'EVIDENCE', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  REFINANCE_RATE_MONITOR: definition('REFINANCE_RATE_MONITOR', 'MONITOR', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'refinance.monitor', ['SUMMARY', 'MONITOR', 'WORKFLOW_PROGRESS']),
  SELL_HOLD_RENT_ANALYSIS: definition('SELL_HOLD_RENT_ANALYSIS', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'sale-case.analysis', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  HOUSEHOLD_INVITATION: definition('HOUSEHOLD_INVITATION', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'OWNER', 'household.invitation', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  GUIDANCE_JOURNEY_CREATE: definition('GUIDANCE_JOURNEY_CREATE', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'guidance.journey.create', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  QUOTE_COMPARISON_CREATE: definition('QUOTE_COMPARISON_CREATE', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'quote-comparison.create', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  QUOTE_COMPARISON_REVIEW: definition('QUOTE_COMPARISON_REVIEW', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'quote-comparison.review', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  HOME_DEADLINE_MONITOR: definition('HOME_DEADLINE_MONITOR', 'MONITOR', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'home-deadline.monitor', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  CAPITAL_RESERVE_PLAN: definition('CAPITAL_RESERVE_PLAN', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'capital-reserve.plan', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  PROPERTY_TAX_APPEAL_READINESS: definition('PROPERTY_TAX_APPEAL_READINESS', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'property-tax.appeal-readiness', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  RENOVATION_PERMIT_READINESS: definition('RENOVATION_PERMIT_READINESS', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'renovation-permit.readiness', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'BOUNDARY']),
  MAJOR_EVENT_ENTRY: definition('MAJOR_EVENT_ENTRY', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'major-event.entry', ['SUMMARY', 'CAPABILITY_LIST', 'BOUNDARY']),
  EMERGENCY_BOUNDARY: definition('EMERGENCY_BOUNDARY', 'UNSAFE_OR_RESTRICTED', false, 'DETERMINISTIC', 'EMERGENCY_BOUNDARY', null, 'boundary.emergency', ['BOUNDARY']),
  UNSAFE_RESTRICTED_BOUNDARY: definition('UNSAFE_RESTRICTED_BOUNDARY', 'UNSAFE_OR_RESTRICTED', false, 'DETERMINISTIC', 'UNSAFE_RESTRICTED_BOUNDARY', null, 'boundary.unsafe-restricted', ['BOUNDARY']),
  OUT_OF_SCOPE_BOUNDARY: definition('OUT_OF_SCOPE_BOUNDARY', 'OUT_OF_SCOPE', false, 'DETERMINISTIC', 'OUT_OF_SCOPE_BOUNDARY', null, 'boundary.out-of-scope', ['BOUNDARY']),
  GROUNDED_GUIDANCE: definition('GROUNDED_GUIDANCE', 'GENERAL_HOME_GUIDANCE', false, 'REMOTE_GENERATION', 'STANDARD', null, 'grounded.guidance', ['SUMMARY', 'EVIDENCE', 'BOUNDARY']),
  // Ask Intelligence FRD Phase 8A — HVAC Decision Thread foundation
  // (docs/product/AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md §10, §25).
  // Distinct from REPLACEMENT_GUIDANCE: these operate on the Decision
  // Platform's durable DecisionThread/RecommendationSnapshot models via the
  // registered HVAC repair/replace engine, not the generic appliance heuristic.
  // Phase 8B: HVAC_DECISION_START's "already active" branch and
  // HVAC_DECISION_CONTINUE both go through continueHvacDecisionThread,
  // which can trigger a stale recompute -- so both must declare WHY_NOW and
  // RECOMMENDATION_CHANGE, not just DECISION_PROGRESS, or
  // createAskExecution's "undeclared block type" guard throws the first
  // time a recompute actually happens.
  HVAC_DECISION_START: definition('HVAC_DECISION_START', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'decision-platform.hvac.start', ['SUMMARY', 'DECISION_PROGRESS', 'WHY_NOW', 'RECOMMENDATION_CHANGE', 'PREFERENCE_REFERENCE', 'EVIDENCE', 'LIMITATION', 'ASSUMPTIONS', 'GROUPED_LIST', 'BOUNDARY']),
  HVAC_DECISION_CONTINUE: definition('HVAC_DECISION_CONTINUE', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'decision-platform.hvac.continue', ['DECISION_PROGRESS', 'WHY_NOW', 'RECOMMENDATION_CHANGE', 'PREFERENCE_REFERENCE', 'EVIDENCE', 'LIMITATION', 'EMPTY_STATE']),
  HVAC_DECISION_SCENARIO: definition('HVAC_DECISION_SCENARIO', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'decision-platform.hvac.scenario', ['SUMMARY', 'SCENARIO_COMPARISON', 'PREFERENCE_REFERENCE', 'LIMITATION', 'BOUNDARY']),
  HVAC_DECISION_ABANDON: definition('HVAC_DECISION_ABANDON', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'decision-platform.hvac.abandon', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  // Ask Intelligence FRD Phase 8B — confirmed ownership-horizon
  // personalization (FRD §11). Preferences are sensitive/material, hence
  // MATERIAL_DECISION for save; forget/revoke is safety-neutral, matching
  // HVAC_DECISION_ABANDON's STANDARD choice.
  HVAC_PREFERENCE_SAVE: definition('HVAC_PREFERENCE_SAVE', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'decision-platform.hvac.preference.save', ['SUMMARY', 'PREFERENCE_REFERENCE', 'BOUNDARY']),
  HVAC_PREFERENCE_FORGET: definition('HVAC_PREFERENCE_FORGET', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'decision-platform.hvac.preference.forget', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  // Ask Intelligence FRD Phase 9A ("What changed?", §16). Pure read-only,
  // mirrors INCIDENT_CLAIM_STATUS's shape: no confirmation, no
  // askDomainCommandRegistry entry, VIEWER floor.
  HOME_CHANGE_SUMMARY: definition('HOME_CHANGE_SUMMARY', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'home-change.summary', ['CHANGE_SUMMARY', 'EMPTY_STATE']),
  // Ask Intelligence FRD Phase 10A (§19, §21.5, §25 "Phase 10A") — outcome
  // observation. STANDARD safety, not MATERIAL_DECISION: recording or
  // disputing a reported outcome never changes a recommendation or ranking
  // (Phase 10A exit criterion: "no production calibration is active" --
  // that only happens in the separate, unbuilt Phase 10B).
  HVAC_DECISION_OUTCOME_REPORT: definition('HVAC_DECISION_OUTCOME_REPORT', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'decision-platform.hvac.outcome.report', ['SUMMARY', 'OUTCOME_SUMMARY', 'GROUPED_LIST', 'EMPTY_STATE']),
  HVAC_DECISION_OUTCOME_VIEW: definition('HVAC_DECISION_OUTCOME_VIEW', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'decision-platform.hvac.outcome.view', ['OUTCOME_SUMMARY', 'GROUPED_LIST', 'EMPTY_STATE']),
  HVAC_DECISION_OUTCOME_UNLINK: definition('HVAC_DECISION_OUTCOME_UNLINK', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'decision-platform.hvac.outcome.unlink', ['SUMMARY', 'WORKFLOW_PROGRESS', 'GROUPED_LIST', 'EMPTY_STATE']),
  // Home Buyer FRD §13.3. Reads are VIEWER-floor STATUS_SUMMARY/RECORD_QUERY
  // operations grounded in the canonical Buyer Plan overview; the completion
  // command mirrors MAINTENANCE_TASK_COMPLETE's CONTRIBUTOR-floor COMMAND shape.
  BUYER_PLAN_STATUS: definition('BUYER_PLAN_STATUS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'buyer.plan.status', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'BOUNDARY']),
  BUYER_DEADLINES: definition('BUYER_DEADLINES', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'buyer.deadlines', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  BUYER_DOCUMENT_READINESS: definition('BUYER_DOCUMENT_READINESS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'buyer.document-readiness', ['SUMMARY', 'EVIDENCE']),
  BUYER_INSPECTION_REVIEW: definition('BUYER_INSPECTION_REVIEW', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'buyer.inspection-review', ['SUMMARY', 'EVIDENCE', 'BOUNDARY']),
  BUYER_TASK_COMPLETE: definition('BUYER_TASK_COMPLETE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'buyer.task.complete', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  BUYER_TASK_CREATE: definition('BUYER_TASK_CREATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'buyer.task.create', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  BUYER_TASK_UPDATE: definition('BUYER_TASK_UPDATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'buyer.task.update', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS']),
  BUYER_MOVE_STATUS: definition('BUYER_MOVE_STATUS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'buyer.move-status', ['SUMMARY', 'GROUPED_LIST']),
  BUYER_FINANCING_READINESS: definition('BUYER_FINANCING_READINESS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'buyer.financing-readiness', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  BUYER_TITLE_ESCROW_READINESS: definition('BUYER_TITLE_ESCROW_READINESS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'buyer.title-escrow-readiness', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  BUYER_WALKTHROUGH_READINESS: definition('BUYER_WALKTHROUGH_READINESS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'buyer.walkthrough-readiness', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  BUYER_DISCLOSURE_FUNDS_READINESS: definition('BUYER_DISCLOSURE_FUNDS_READINESS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'buyer.disclosure-funds-readiness', ['SUMMARY', 'BOUNDARY']),
  BUYER_CLOSING_DAY_READINESS: definition('BUYER_CLOSING_DAY_READINESS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'buyer.closing-day-readiness', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  BUYER_CONTRACT_TIMELINE: definition('BUYER_CONTRACT_TIMELINE', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'buyer.contract-timeline', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  BUYER_NEGOTIATION_READINESS: definition('BUYER_NEGOTIATION_READINESS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'buyer.negotiation-readiness', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  BUYER_COST_READINESS: definition('BUYER_COST_READINESS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'buyer.cost-readiness', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  // Reclassification is a canonical, transactional obligation change (FRD
  // §10.2), not a routine edit -- CONTRIBUTOR floor with explicit confirmation,
  // matching the domain command registry entry below.
  BUYER_FINDING_DISPOSITION: definition('BUYER_FINDING_DISPOSITION', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'buyer.finding.disposition', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  // Scoped to cancellation and lifecycle-date changes only. The close
  // transition itself is deliberately NOT exposed here -- FRD §14.13/§21.1
  // require the dedicated Closing Day Companion's own wire-fraud/ID/funds
  // checklist and explicit confirmation before RECENT_OWNER; a chat command
  // must not bypass that. Pause is not yet backed by a real lifecycle
  // transition in the service layer, so it is intentionally unavailable
  // rather than simulated (FRD §21.1).
  BUYER_LIFECYCLE_UPDATE: definition('BUYER_LIFECYCLE_UPDATE', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'buyer.lifecycle.update', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
});

export function getAskOperationDefinition(operationId: AskOperationId): AskOperationDefinition {
  return ASK_OPERATION_DEFINITIONS[operationId];
}

export function validateAskOperationDefinitions(): string[] {
  const ids = new Set<string>();
  const issues: string[] = [];
  for (const [key, entry] of Object.entries(ASK_OPERATION_DEFINITIONS)) {
    if (key !== entry.operationId) issues.push(`${key}: operationId mismatch`);
    if (ids.has(entry.operationId)) issues.push(`${key}: duplicate operationId`);
    ids.add(entry.operationId);
    if (!entry.version || !entry.adapterKey || !entry.evalSuite) issues.push(`${key}: missing version, adapter, or eval declaration`);
    if (!entry.allowedBlockTypes.length) issues.push(`${key}: no allowed result blocks`);
    if (entry.requiresProperty && entry.propertyRoleFloor == null) issues.push(`${key}: property operation has no authorization floor`);
    if (entry.safetyClass.endsWith('_BOUNDARY') && !entry.allowedBlockTypes.includes('BOUNDARY')) issues.push(`${key}: boundary operation lacks boundary result`);
    issues.push(...validateAskSemanticContract(entry.semantic).map((issue) => `${key}: ${issue}`));
  }
  issues.push(...validateAskOperationSemanticPackages(Object.keys(ASK_OPERATION_DEFINITIONS) as AskOperationId[]));
  return issues;
}

// Home Buyer FRD §13.3/§13.4. Deliberately keyed on closing/purchase/"buyer
// plan" phrasing so these never shadow the equivalent homeowner operations
// (HOME_ACTIONS, MAINTENANCE_TASK_COMPLETE, etc.) for a plain maintenance or
// ownership question -- the adapters themselves also gracefully decline when
// the selected property has no active buyer journey (see
// buyerPlanContextProvider). Checked ahead of maintenanceCompletePattern
// since "task ... complete" would otherwise match generically.
const buyerTaskCompletePattern = /\b(?:mark|complete|finish)\b.{0,60}\b(?:buyer (?:plan )?task|closing (?:plan )?task)\b|\b(?:buyer (?:plan )?task|closing (?:plan )?task)\b.{0,60}\b(?:complete|completed|done)\b|\bi(?:'ve| have)?\s+(?:completed|finished)\b.{0,60}\b(?:buyer plan|closing plan) task\b/i;
const buyerDeadlinesPattern = /\b(?:next deadline|what'?s due|what is due|upcoming deadlines?)\b.{0,40}\b(?:before closing|for closing|closing)\b|\bdeadlines?\b.{0,40}\b(?:before closing|for (?:this|my) (?:purchase|closing))\b|\bwhat could (?:delay|block)\b.{0,40}\b(?:my )?closing\b|\b(?:is|are)\s+anything\b.{0,40}\bclosing\b.{0,20}\bat risk\b|\bclosing\b.{0,40}\b(?:at risk|in jeopardy|in danger)\b|\b(?:at risk|in jeopardy|in danger)\b.{0,40}\bclosing\b/i;
const buyerDocumentReadinessPattern = /\b(?:transaction|closing)\b.{0,40}\bdocuments?\b.{0,50}\b(?:missing|still need|readiness|received)\b|\bwhich (?:transaction |closing )?documents?\b.{0,50}\b(?:missing|before closing|for (?:this|my) closing)\b/i;
const buyerInspectionReviewPattern = /\b(?:inspection )?findings?\b.{0,50}\b(?:need(?:s)? a decision|still need(?:s)? a decision|undecided|need(?:s)? classif(?:y|ication))\b|\breview (?:my |the )?(?:inspection )?findings?\b.{0,30}\b(?:before closing|for (?:this|my) (?:purchase|closing))\b/i;
const buyerPlanStatusPattern = /\b(?:what should i do next|next step)\b.{0,50}\b(?:this purchase|my closing|buying this home|closing plan|buyer plan)\b|\bstatus of (?:my |this )?(?:home )?purchase\b|\bhow close am i\b.{0,40}\bclosing\b|\b(?:closing plan|buyer plan) status\b|\b(?:what should i )?focus on\b.{0,50}\b(?:this week|my closing|this closing|this purchase|closing plan|buyer plan)\b/i;
const buyerTaskCreatePattern = /\b(?:add|create)\b.{0,60}\b(?:to (?:my |the )?(?:buyer plan|closing plan)|as a (?:buyer plan|closing) task)\b|\b(?:add|create) (?:a |an )?(?:buyer plan|closing plan) task\b/i;
const buyerTaskUpdatePattern = /\b(?:reschedule|move|assign|unassign|reassign)\b.{0,60}\b(?:buyer plan|closing plan) task\b|\b(?:buyer plan|closing plan) task\b.{0,60}\b(?:reschedule|assign|due date)\b/i;
const buyerMoveStatusPattern = /\bwhat should i do\b.{0,30}\bbefore (?:i )?move[- ]?in\b|\bmov(?:e|ing)[- ](?:in|out) (?:progress|status|readiness)\b.{0,40}\bpurchase\b|\bmoving\b.{0,40}\b(?:progress|status)\b.{0,30}\b(?:closing|purchase|buyer plan)\b/i;
const buyerFinancingReadinessPattern = /\b(?:financing|lender|loan|underwriting|appraisal)\b.{0,50}\b(?:delay|block|ready|readiness|status)\b.{0,40}\bclosing\b|\bwhat(?:'s| is)\b.{0,30}\b(?:financing|lender|loan|appraisal)\b.{0,30}\bstatus\b/i;
const buyerTitleEscrowReadinessPattern = /\b(?:title|escrow|survey|hoa)\b.{0,50}\b(?:open|outstanding|status|ready|readiness)\b.{0,40}\b(?:closing|purchase)\b|\bwhat(?:'s| is)\b.{0,30}\bopen\b.{0,30}\b(?:title|escrow)\b/i;
const buyerWalkthroughReadinessPattern = /\bfinal walkthrough\b.{0,50}\b(?:checklist|ready|readiness|prepare|status)\b|\b(?:prepare|ready)\b.{0,40}\bfinal walkthrough\b/i;
const buyerDisclosureFundsReadinessPattern = /\bclosing disclosure\b.{0,50}\b(?:change|changes|ready|readiness|review|status)\b|\bwhat changed\b.{0,40}\bclosing disclosure\b|\bfunds\b.{0,30}\bready\b.{0,30}\bclosing\b/i;
const buyerClosingDayReadinessPattern = /\bclosing day\b.{0,50}\b(?:ready|readiness|need|checklist|prepare)\b|\bwhat do i need\b.{0,40}\bclosing day\b/i;
const buyerContractTimelinePattern = /\bcontract\b.{0,50}\b(?:dates?|terms?|timeline|contingenc(?:y|ies))\b.{0,40}\b(?:confirm|need|still|closing)\b|\bwhich contract dates?\b.{0,40}\bconfirm\b/i;
const buyerNegotiationReadinessPattern = /\bwhat should i discuss\b.{0,40}\b(?:my )?agent\b.{0,40}\binspection\b|\bnegotiation\b.{0,40}\b(?:readiness|status|discuss)\b.{0,40}\b(?:closing|purchase|inspection)\b|\bseller (?:response|negotiation)\b.{0,40}\bstatus\b/i;
const buyerCostReadinessPattern = /\bwhat could cost me money\b.{0,40}\b(?:first 90 days|closing|move[- ]in)\b|\bnear[- ]term costs?\b.{0,40}\bpurchase\b|\bwhat (?:will|could)\b.{0,30}\bcost\b.{0,40}\bthis (?:purchase|closing)\b/i;
const buyerFindingDispositionPattern = /\b(?:move|classify|mark)\b.{0,50}\bfinding\b.{0,50}\b(?:post[- ]close|negotiation|dismiss|verified)\b|\bfinding\b.{0,50}\binto (?:my )?post[- ]close plan\b/i;
const buyerLifecycleUpdatePattern = /\bcancel\b.{0,40}\b(?:this|my)\b.{0,20}\b(?:purchase|buyer plan|closing)\b|\bwe closed today\b|\b(?:change|update|move)\b.{0,40}\b(?:target )?closing date\b.{0,40}\bto\b|\b(?:pause|resume)\b.{0,40}\b(?:this|my)\b.{0,20}\b(?:purchase|buyer plan|deal)\b/i;

const emergencyPattern = /\b(smell(?:ing)? gas|gas smell|gas leak|carbon monoxide|\bco (?:alarm|detector)|sparks?\b.{0,25}\b(?:from|at)\b|electrical fire|actively flooding.*electric(?:al)?|fire now)\b/i;
const unsafeRestrictedPattern = /\b(?:bypass|avoid|evade|skip|work around)\b.{0,60}\b(?:permit|inspection|code|licen[cs]e|hoa|disclosure)\b|\b(?:disable|disconnect|remove|tamper with|cover|block)\b.{0,60}\b(?:smoke|carbon monoxide|co|fire|safety)\s*(?:detector|alarm|device)?\b|\b(?:conceal|hide|omit|misrepresent)\b.{0,80}\b(?:damage|defect|mold|leak|flood|fire|buyer|insurer|inspector|lender)\b|\b(?:remove|alter|cut|demolish|open up)\b.{0,70}\b(?:load[- ]bearing|structural)\b.{0,70}\b(?:wall|beam|column|support)?\b|\b(?:load[- ]bearing|structural)\b.{0,70}\b(?:without|skip|avoid|myself|diy)\b.{0,40}\b(?:inspection|permit|engineer|approval)?\b|\b(?:guarantee|certify|confirm(?: definitively)?|promise|tell me (?:for sure|the exact))\b.{0,100}\b(?:approved|approval|eligible|eligibility|legal|compliant|safe|pass inspection|refinanc|mortgage|loan|insurance claim|tax appeal|damage|loss|claim|covered|coverage|sale price|sell for)\b/i;
const unauthorizedDataAccessPattern = /\b(?:show|list|give|export|send|reveal|access|download|delete|remove)\b.{0,50}\b(?:every|all|another|other)\b.{0,35}\b(?:users?[’']?s?|households?|homeowners?|customers?)\b.{0,45}\b(?:propert(?:y|ies)|records?|documents?|data|accounts?)\b|\b(?:uploaded|attached)\b.{0,40}\b(?:invoice|document|file)\b.{0,50}\b(?:says|instructs?|asks?)\b.{0,50}\b(?:send|share|upload|export)\b.{0,40}\b(?:records?|documents?|data)\b|\b(?:turn on|turn off|enable|disable|change|delete|remove|update|modify)\b.{0,60}\bfor\b.{0,20}\b(?:another|other|someone else'?s?)\b.{0,30}\b(?:users?|households?|homeowners?|customers?|person|member)\b|\b(?:change|modify|update|edit)\b.{0,80}\bpropert(?:y|ies)\b.{0,30}\b(?:i |that i )?(?:cannot|can'?t|do not|don'?t) access\b/i;
const outOfScopePattern = /\b(python|javascript|typescript|coding interview|video game|write (?:me )?(?:a )?program|never[- ]ending loop|system prompt|developer message|ignore\b.{0,20}\b(?:previous|prior) instructions|forget\b.{0,20}\b(?:previous|prior) instructions|override (?:the )?(?:system|developer|safety) instructions|pretend (?:that )?you are|act as (?:dan|an unrestricted)|reveal (?:your |the )?(?:prompt|instructions)|jailbreak|base64[- ]decode (?:this|the prompt)|drop (?:a )?(?:table|database)|(?:run|execute|apply) (?:this |the |a )?(?:sql|database query)|production database|delete (?:every|all) (?:property|user|record)|shell command|malware|ransomware|phishing|steal (?:a )?(?:password|credential)|celebrity news|school essay)\b/i;
const maintenancePattern = /\b(maintenance|maintain|task|tasks|overdue|due soon|what(?:'s| is) due|completed work|pending work|service history|what did (?:i|we) complete|work (?:i |we )?(?:completed|finished)|what should (?:i|we) do before (?:winter|spring|summer|fall|autumn))\b/i;
const maintenanceCreatePattern = /\b(?:create|add|schedule|set up)\b.{0,80}\b(?:maintenance(?: task)?|tasks?|gutter (?:cleaning|inspection)|clean(?:ing)? (?:the )?gutters?|filter change|(?:hvac|furnace|boiler|roof|water heater) (?:service|inspection|cleaning|repair|replacement))\b|\b(?:remind me to|put on my maintenance list)\b/i;
const maintenanceCompletePattern = /^\s*(?:please\s+)?(?:(?:mark|set)\b.{0,100}\b(?:task|maintenance|gutter|filter|service|inspection|cleaning|repair)\b.{0,100}\b(?:complete|completed|done)|(?:complete|finish)\b.{0,100}\b(?:task|maintenance|gutter|filter|service|inspection|cleaning|repair))\b|\b(?:i|we) (?:completed|finished)\b.{0,100}\b(?:task|maintenance|gutter|filter|service|inspection|cleaning|repair)\b/i;
const maintenanceUpdatePattern = /\b(?:reschedule|move|change|update|edit|assign|unassign|archive|cancel|reopen|restore)\b.{0,100}\b(?:maintenance|task|gutter|filter|service|inspection|cleaning|repair)\b|\b(?:maintenance|task|gutter|filter|service|inspection|cleaning|repair)\b.{0,100}\b(?:reschedule|assign|archive|cancel|reopen|priority|due date)\b/i;
const guidanceJourneyCreatePattern = /\b(?:start|create|open|begin)\b.{0,50}\b(?:guided plan|guidance journey|guided journey|step-by-step plan)\b/i;
const quoteComparisonCreatePattern = /\b(?:create|start|open|set up)\b.{0,50}\b(?:quote comparison|comparison workspace|workspace for (?:my )?(?:quotes|bids|proposals))\b/i;
const quoteComparisonReviewPattern = /\b(?:compare|review|show|evaluate|which)\b.{0,70}\b(?:quotes?|bids?|proposals?|estimates?)\b|\b(?:quotes?|bids?|proposals?)\b.{0,70}\b(?:compare|comparison|best|cheapest|differences?|review)\b/i;
const homeDeadlineMonitorPattern = /\b(?:notify|alert|remind|monitor|tell me)\b.{0,80}\b(?:(?:important\s+)?home deadlines?|maintenance|task|warranty|insurance|policy|coverage)\b(?:.{0,50}\b(?:due|expire|expires|expiring|renewal)\b)?|\b(?:warranty|insurance|policy|coverage)\b.{0,50}\b(?:expire|expires|expiring|renewal)\b.{0,80}\b(?:notify|alert|remind|monitor|tell me)\b/i;
const capitalReservePattern = /\b(?:capital reserve plan|reserve fund|sinking fund|capital timeline|capital plan|major replacements?|future home expenses?|how much should i save|budget for (?:my )?(?:roof|hvac|systems?|replacements?))\b/i;
const propertyTaxAppealPattern = /\b(?:property tax|assessment|assessed value|tax class|tax exemption)\b.{0,80}\b(?:appeal|contest|challenge|readiness|overassessed|too high|evidence|deadline)\b|\b(?:appeal|contest|challenge)\b.{0,60}\b(?:property tax|assessment|assessed value|tax class|exemption)\b/i;
const renovationPermitPattern = /\b(?:renovation|remodel|addition|project|permit|inspection|hoa)\b.{0,80}\b(?:ready|readiness|start|require|needed|block|blocking|blockers?|compliance|status)\b|\b(?:can i start|am i ready|what is blocking|what are the blockers?)\b.{0,60}\b(?:renovation|remodel|project|work)\b/i;
const majorEventPattern = /\b(?:help|guide|prepare|plan|checklist|what should i do|what do i need)\b.{0,70}\b(?:moving|move in|move out|selling my home|home sale|major renovation|remodeling|insurance claim|storm damage|new baby|aging in place)\b/i;
const coveragePattern = /\b(missing coverage|coverage gaps?|uncovered|warranty coverage|insurance coverage|items? (?:without|missing) (?:a )?(?:warranty|coverage)|warrant(?:y|ies) (?:are )?(?:expire|expiring|expiry)|coverage (?:is )?(?:expire|expiring|expiry)|evidence (?:for|of) (?:my )?(?:expensive|high[ -]?value)? ?(?:appliances?|items?|systems?))\b/i;
// Record-query status of already-recorded canonical Incident/Claim rows
// (§9.2 requires "active projects, incidents, claims, permits, and
// inspections" coverage). Deliberately distinct from majorEventPattern's
// guide/prepare/plan/checklist/"what should I do" phrasing (e.g. Appendix
// A's "What do I need for an insurance claim?"), which is a request to
// start/navigate a claim, not a query about existing recorded ones -- that
// pattern is checked earlier in the cascade and wins for that overlap.
const incidentClaimStatusPattern = /\b(?:status of|track|do i have|open|active|recent|pending|filed|submitted)\b.{0,40}\b(?:insurance )?claims?\b|\bclaims?\b.{0,40}\b(?:status|open|active|pending|filed|submitted|history|recorded)\b|\b(?:recorded|logged|detected|any|active|recent|open|new)\b.{0,40}\bincidents?\b|\bincidents?\b.{0,40}\b(?:recorded|logged|detected|history|status|active|recent)\b|\bwhat incidents?\b/i;
const savingsOpportunitiesPattern = /\b(where|how|ways?|opportunities?)\b.{0,45}\b(save|saving|savings|lower|reduce)\b.{0,35}\b(money|costs?|bills?|expenses?|insurance|internet|utilities|energy|warranty)\b|\b(?:where|how) (?:can|could|do) (?:i|we) save\b|\b(?:saving|savings) opportunities\b|\blower (?:my |our )?(?:home |household )?(?:costs?|bills?|expenses?)\b|\bwhat savings\b.{0,35}\b(?:realized|received|saved)\b|\b(?:fastest|shortest|best) payback\b/i;
const ownershipCostsPattern = /\b(?:how much|what does|what is|what are|show|break down)\b.{0,45}\b(?:home|house|housing|property|ownership)\b.{0,45}\b(?:cost|costs|expense|expenses|outflow)\b|\b(?:how much am i|what am i)\b.{0,45}\b(?:paying|spending)\b.{0,45}\b(?:home|house|housing|property)\b|\b(?:monthly|annual|yearly|total|true|ownership|operating|cash)\s+(?:home |house |housing |property )?(?:cost|costs|expenses?|outflow)\b|\bcost of owning\b|\b(?:largest|biggest|highest|most expensive)\b.{0,35}\b(?:home |ownership )?(?:cost|expense|category)\b|\bwhich (?:cost |expense )?categor(?:y|ies)\b.{0,35}\b(?:most|highest|largest)\b/i;
const inventoryLookupPattern = /\b(?:what do you know about|tell me about|show|find|list|which|do i have)\b.{0,65}\b(?:inventory|appliances?|systems?|equipment|hvac|furnace|air conditioner|heat pump|boiler|refrigerator|fridge|water heater|roof|washer|dryer|dishwasher)\b|\b(?:inventory|appliance|system|equipment)\s+(?:record|records|details|items|list)\b|\b(?:incomplete|missing)\b.{0,35}\b(?:inventory|appliance|system)\s+(?:record|records|details|information)\b|\b(?:my|the|this)\s+(?:hvac|furnace|air conditioner|heat pump|boiler|refrigerator|fridge|water heater|roof|washer|dryer|dishwasher)\b.{0,45}\b(?:history|record|details|information|know)\b|\b(?:systems?|equipment|appliances?)\b.{0,45}\b(?:end of life|expiry|expire|incomplete)\b/i;
const propertySummaryPattern = /\b(?:summarize|summary of|overview of|what do you know about|tell me about|show me)\b.{0,60}\b(?:my|this|the)?\s*(?:home|house|property|home record|living home record)\b|\b(?:home|property|living home)\s+(?:record )?(?:summary|overview|profile)\b|\bhow complete\b.{0,45}\b(?:home record|property profile|home profile|living home record)\b/i;
const PROPERTY_COMPLETENESS_PATTERNS = [
  /\b(?:pending|missing|incomplete|unfilled|outstanding|remaining)\b.{0,50}\b(?:details|information|info|facts|fields|records?)\b.{0,60}\b(?:home|house|property|profile|record)\b/i,
  /\b(?:details|information|info|facts|fields|records?)\b.{0,45}\b(?:missing|incomplete|unfilled|outstanding|remaining|need(?:s|ed)? (?:to be )?(?:added|filled|completed|verified))\b.{0,60}\b(?:home|house|property|profile|record)\b/i,
  /\b(?:what|which|anything|are there any|do i have)\b.{0,45}\b(?:need to|needs to|should i|still need to)\s+(?:add|fill(?: in| out)?|complete|verify|update)\b.{0,65}\b(?:home|house|property|profile|record)\b/i,
  /\b(?:is|are)\b.{0,25}\b(?:home|house|property)(?:\s+(?:record|profile|details|information))?\b.{0,30}\b(?:complete|incomplete|missing details|missing information)\b/i,
  /\b(?:is|are)\b.{0,20}\b(?:all )?(?:details|information|info|facts|fields)\b.{0,20}\bcomplete\b.{0,45}\b(?:home|house|property|profile|record)\b/i,
  /\b(?:home|house|property)(?:\s+(?:record|profile))?\b.{0,45}\b(?:missing|pending|incomplete|unfilled|outstanding|remaining)\b.{0,30}\b(?:details|information|info|facts|fields)\b/i,
  /\b(?:home|house|property)(?:\s+(?:record|profile))?\s+(?:details|information|info|facts|fields)\b.{0,40}\b(?:left|missing|pending|need(?:s)? (?:to be )?(?:added|filled|completed|verified))\b/i,
  /\bhow complete\b.{0,45}\b(?:home record|property profile|home profile|living home record)\b/i,
] as const;

export function isPropertyCompletenessRequest(message: string): boolean {
  return PROPERTY_COMPLETENESS_PATTERNS.some((pattern) => pattern.test(message));
}
const homeActionsPattern = /\b(?:what should i do next|what should i do before closing|what needs (?:my |our )?attention|next best action|highest priority|top priorit(?:y|ies)|home actions?|what can wait|what should i plan|anything urgent|urgent home action|where should i start)\b/i;
// Ask Intelligence FRD Phase 9A ("What changed?", §16). Deliberately excludes
// any message mentioning "decision" (checked at the call site) -- a phrase
// like "what changed about this decision" is a Decision Thread continuity
// question, not a property-wide change digest, but has no HVAC-family
// keyword for hvacDecisionContinuePattern to key off; routing it into this
// generic operation would be a worse answer than today's existing fallback,
// so it's left alone for a future phase with real conversational context.
const homeChangeSummaryPattern = /\bwhat(?:'s| is|s)?\s+(?:changed|new)\b|\banything\s+(?:new|changed)\b|\bany\s+(?:recent\s+)?(?:changes|updates)\b|\brecent(?:ly)?\s+(?:changes|updates)\b|\bwhat happened\s+(?:recently|lately)\b|\bwhat'?s different\b/i;
const replacementPattern = /\b(when should i (?:replace|upgrade)|replace (?:my|the)|repair or replace|how (?:old|long).*(?:refrigerator|fridge)|(?:refrigerator|fridge).*(?:replace|replacement|lifespan|life expectancy))\b/i;
// Ask Intelligence FRD Phase 8A: HVAC-specific repair/replace decision
// routing must win over the generic replacementPattern above for HVAC
// systems (the FRD's certified first vertical slice), while every other
// item (fridge, water heater, etc.) keeps routing to REPLACEMENT_GUIDANCE
// unchanged -- these four patterns are checked before replacementPattern in
// the cascade below and all require an HVAC-family keyword.
const hvacKeyword = '(?:hvac|furnace|heater|heating unit|air conditioner|a\\/?c unit|heat pump|central air|heating system|cooling system)';
const hvacDecisionContinuePattern = new RegExp(`\\b(?:status of|resume|continue|check on|where (?:are we|do things stand)|update on)\\b.{0,60}\\b${hvacKeyword}\\b.{0,40}\\bdecision\\b|\\bdecision\\b.{0,40}\\b(?:status|update|progress)\\b.{0,60}\\b${hvacKeyword}\\b`, 'i');
const hvacDecisionScenarioPattern = new RegExp(`\\b(?:new |another )?quote\\b.{0,80}\\b${hvacKeyword}\\b.{0,60}\\b(?:decision|repair or replace|compare|change)\\b|\\b${hvacKeyword}\\b.{0,60}\\bquote\\b.{0,60}\\b(?:decision|compare|scenario)\\b`, 'i');
const hvacDecisionAbandonPattern = new RegExp(`\\b(?:abandon|cancel|stop tracking|drop)\\b.{0,60}\\b${hvacKeyword}\\b.{0,40}\\bdecision\\b`, 'i');
// Ask Intelligence FRD Phase 8B: an explicit save/remember verb combined
// with a substantive preference mention (sell timeframe or repair/replace
// approach) -- the FRD requires this never be silently inferred, so routing
// alone is not the confirmation; decisionPreferenceService.ts's parsers are
// the strict, save-verb-gated source of truth for what actually gets saved.
const hvacPreferenceSaveVerbPattern = /\b(?:save|remember|keep track of|note that|record that)\b/i;
const hvacPreferenceSaveSubjectPattern = /\b(?:sell|selling|plan(?:s|ning)?\s+to\s+sell)\b.{0,40}\b(?:month|year)s?\b|\bminimi[sz]e (?:the )?(?:upfront|long[- ]term) cost\b|\bmaximi[sz]e reliability\b/i;
const hvacPreferenceForgetPattern = /\b(?:forget|stop using|remove|revoke)\b.{0,60}\b(?:ownership horizon|sell(?:ing)? (?:plan|timeline)|repair[- ]replace approach|repair or replace preference|hvac (?:preference|plan))\b/i;
const hvacDecisionStartPattern = new RegExp(`\\b(?:repair or replace|should i replace|should i repair|fix or replace|worth repairing|worth replacing)\\b.{0,60}\\b${hvacKeyword}\\b|\\b${hvacKeyword}\\b.{0,60}\\b(?:repair or replace|repair vs\\.? replace|fix or replace|worth repairing|worth replacing)\\b`, 'i');
// Ask Intelligence FRD Phase 10A (§19.2's homeowner-report source, §25
// "Phase 10A"). Past-tense completion/start language, distinct from
// hvacDecisionStartPattern's forward-looking "should I replace" phrasing
// above and from maintenanceCompletePattern's generic task/gutter/filter
// keyword list below, which has no HVAC-specific keyword to collide with.
const hvacDecisionOutcomeReportPattern = new RegExp(`\\b(?:i|we)(?:'ve| have)?\\s+(?:already\\s+|ended up\\s+)?(?:installing|installed|replaced|repaired|fixed|completed|finished|started)\\b.{0,60}\\b${hvacKeyword}\\b|\\b${hvacKeyword}\\b.{0,60}\\b(?:is|was|has been)\\s+(?:installed|replaced|repaired|fixed|completed|finished|done)\\b`, 'i');
const hvacDecisionOutcomeViewPattern = new RegExp(`\\b(?:outcome|result|what happened|how did it (?:turn out|go)|did (?:i|we|it) (?:actually )?(?:replace|repair|fix))\\b.{0,60}\\b${hvacKeyword}\\b|\\b${hvacKeyword}\\b.{0,60}\\b(?:outcome|result)\\b`, 'i');
const hvacDecisionOutcomeUnlinkPattern = new RegExp(
  `\\b(?:that'?s (?:not right|wrong|incorrect)|undo (?:that|the) (?:outcome|report)|remove (?:that|the) outcome|dispute (?:that|the) outcome)\\b.{0,60}\\b${hvacKeyword}\\b`
  + `|\\b${hvacKeyword}\\b.{0,60}\\b(?:outcome|report)\\b.{0,40}\\b(?:wrong|incorrect|undo|remove|dispute)\\b`
  + `|\\boutcome\\b.{0,40}\\b(?:is\\s+)?(?:wrong|incorrect)\\b.{0,60}\\b${hvacKeyword}\\b`
  + `|\\b(?:take back|retract|unlink)\\b.{0,50}\\b(?:outcome|result|report|record|logged)\\b.{0,60}\\b${hvacKeyword}\\b`,
  'i',
);
const refinanceAnalysisPattern = /\b(is (?:it )?(?:a )?good (?:time|option).*refinanc(?:e|ing)|should i refinanc(?:e|ing)|is refinanc(?:ing|e) (?:now )?(?:worth|good|right)|ideal (?:interest )?rate.*refinanc(?:e|ing)|what rate.*refinanc(?:e|ing)|refinanc(?:e|ing).*(?:worth it|make sense|good option))\b/i;
const refinanceMonitorPattern = /\b(?:notify|alert|let me know|monitor|tell me).*(?:mortgage |refinanc(?:e|ing) )?rates?.*(?:below|under|drop|reach)|\brates?.*(?:below|under|drop|reach).*(?:notify|alert|let me know|monitor|tell me)\b/i;
const sellHoldRentAnalysisPattern = /\b(?:should|could|would|will|is|when|benefit|better|compare|decide|planning|plan)\b.{0,55}\b(?:sell|selling|hold|holding|rent(?:ing)?(?: out)?|landlord)\b|\b(?:sell|selling)\b.{0,55}\b(?:hold|holding|rent(?:ing)?(?: out)?|landlord|good time|worth|benefit|better)\b|\b(?:hold|holding|rent(?:ing)?(?: out)?)\b.{0,55}\b(?:sell|selling|better|benefit)\b/i;
const householdInvitationPattern = /\b(?:invite|add|share (?:my|the) home with)\b.{0,50}\b(?:wife|husband|spouse|partner|family member|household member|someone|person)\b|\bhousehold\b.{0,40}\b(?:invite|invitation|add (?:a )?member)\b/i;
const explicitCapabilityPattern = /\b(?:tool|something (?:available|to help)|anything (?:available|to help)|what can help|do you have|feature available)\b/i;
const capabilityPattern = /\b(tool|something available|what can help|do you have|help me (?:with|plan)|refinanc|sell.*rent|compare.{0,40}(?:quotes?|bids?|proposals?|estimates?)|organize.{0,40}(?:records?|documents?|paperwork)|track.{0,40}(?:permits?|projects?)|plan.{0,40}(?:renovation|remodel|replacement)|savings?|rebates?|monitor)\b/i;

export function resolveAskOperation(message: string): AskOperationResolution {
  const resolved = (operationId: AskOperationId, confidence: number): AskOperationResolution => ({
    ...getAskOperationDefinition(operationId),
    confidence,
  });
  if (emergencyPattern.test(message)) {
    return resolved('EMERGENCY_BOUNDARY', 1);
  }
  if (unsafeRestrictedPattern.test(message)) {
    return resolved('UNSAFE_RESTRICTED_BOUNDARY', 0.99);
  }
  if (unauthorizedDataAccessPattern.test(message)) {
    return resolved('UNSAFE_RESTRICTED_BOUNDARY', 0.99);
  }
  if (outOfScopePattern.test(message)) {
    return resolved('OUT_OF_SCOPE_BOUNDARY', 0.99);
  }
  // Home Buyer FRD §13.3: checked ahead of every generic pattern below (incl.
  // maintenanceCompletePattern and homeActionsPattern) since buyer phrasing
  // like "closing task ... complete" or "closing plan status" would otherwise
  // be captured by their broader keyword sets.
  if (buyerTaskCompletePattern.test(message)) {
    return resolved('BUYER_TASK_COMPLETE', 0.97);
  }
  if (buyerDeadlinesPattern.test(message)) {
    return resolved('BUYER_DEADLINES', 0.96);
  }
  if (buyerDocumentReadinessPattern.test(message)) {
    return resolved('BUYER_DOCUMENT_READINESS', 0.96);
  }
  if (buyerInspectionReviewPattern.test(message)) {
    return resolved('BUYER_INSPECTION_REVIEW', 0.95);
  }
  if (buyerPlanStatusPattern.test(message)) {
    return resolved('BUYER_PLAN_STATUS', 0.95);
  }
  if (buyerTaskCreatePattern.test(message)) {
    return resolved('BUYER_TASK_CREATE', 0.96);
  }
  if (buyerTaskUpdatePattern.test(message)) {
    return resolved('BUYER_TASK_UPDATE', 0.96);
  }
  if (buyerMoveStatusPattern.test(message)) {
    return resolved('BUYER_MOVE_STATUS', 0.95);
  }
  if (buyerFinancingReadinessPattern.test(message)) {
    return resolved('BUYER_FINANCING_READINESS', 0.95);
  }
  if (buyerTitleEscrowReadinessPattern.test(message)) {
    return resolved('BUYER_TITLE_ESCROW_READINESS', 0.95);
  }
  if (buyerWalkthroughReadinessPattern.test(message)) {
    return resolved('BUYER_WALKTHROUGH_READINESS', 0.95);
  }
  if (buyerDisclosureFundsReadinessPattern.test(message)) {
    return resolved('BUYER_DISCLOSURE_FUNDS_READINESS', 0.95);
  }
  if (buyerClosingDayReadinessPattern.test(message)) {
    return resolved('BUYER_CLOSING_DAY_READINESS', 0.95);
  }
  if (buyerFindingDispositionPattern.test(message)) {
    return resolved('BUYER_FINDING_DISPOSITION', 0.96);
  }
  if (buyerLifecycleUpdatePattern.test(message)) {
    return resolved('BUYER_LIFECYCLE_UPDATE', 0.96);
  }
  if (buyerContractTimelinePattern.test(message)) {
    return resolved('BUYER_CONTRACT_TIMELINE', 0.95);
  }
  if (buyerNegotiationReadinessPattern.test(message)) {
    return resolved('BUYER_NEGOTIATION_READINESS', 0.95);
  }
  if (buyerCostReadinessPattern.test(message)) {
    return resolved('BUYER_COST_READINESS', 0.95);
  }
  // Ask Intelligence FRD Phase 8A: checked ahead of quoteComparisonReviewPattern
  // and replacementPattern below, since both are generic enough to otherwise
  // capture HVAC-specific decision-thread phrasing (e.g. a quote-plus-decision
  // sentence matches quoteComparisonReviewPattern's "quote ... compare" shape
  // too). All four require an HVAC-family keyword, so non-HVAC phrasing is
  // unaffected and still falls through to the generic patterns unchanged.
  if (hvacDecisionContinuePattern.test(message)) {
    return resolved('HVAC_DECISION_CONTINUE', 0.97);
  }
  if (hvacDecisionScenarioPattern.test(message)) {
    return resolved('HVAC_DECISION_SCENARIO', 0.96);
  }
  if (hvacPreferenceForgetPattern.test(message)) {
    return resolved('HVAC_PREFERENCE_FORGET', 0.96);
  }
  if (hvacPreferenceSaveVerbPattern.test(message) && hvacPreferenceSaveSubjectPattern.test(message)) {
    return resolved('HVAC_PREFERENCE_SAVE', 0.95);
  }
  if (hvacDecisionAbandonPattern.test(message)) {
    return resolved('HVAC_DECISION_ABANDON', 0.97);
  }
  if (hvacDecisionOutcomeUnlinkPattern.test(message)) {
    return resolved('HVAC_DECISION_OUTCOME_UNLINK', 0.96);
  }
  if (hvacDecisionOutcomeReportPattern.test(message)) {
    return resolved('HVAC_DECISION_OUTCOME_REPORT', 0.95);
  }
  if (hvacDecisionOutcomeViewPattern.test(message)) {
    return resolved('HVAC_DECISION_OUTCOME_VIEW', 0.94);
  }
  if (hvacDecisionStartPattern.test(message)) {
    return resolved('HVAC_DECISION_START', 0.96);
  }
  if (maintenanceCompletePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('MAINTENANCE_TASK_COMPLETE', 0.97);
  }
  if (maintenanceUpdatePattern.test(message)) {
    return resolved('MAINTENANCE_TASK_UPDATE', 0.97);
  }
  if (guidanceJourneyCreatePattern.test(message)) {
    return resolved('GUIDANCE_JOURNEY_CREATE', 0.97);
  }
  if (quoteComparisonCreatePattern.test(message)) {
    return resolved('QUOTE_COMPARISON_CREATE', 0.97);
  }
  if (quoteComparisonReviewPattern.test(message) && !explicitCapabilityPattern.test(message) && !/\bcan you help me\b/i.test(message)) {
    return resolved('QUOTE_COMPARISON_REVIEW', 0.97);
  }
  if (homeDeadlineMonitorPattern.test(message)) {
    return resolved('HOME_DEADLINE_MONITOR', 0.97);
  }
  if (propertyTaxAppealPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('PROPERTY_TAX_APPEAL_READINESS', 0.98);
  }
  if (capitalReservePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('CAPITAL_RESERVE_PLAN', 0.97);
  }
  if (renovationPermitPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('RENOVATION_PERMIT_READINESS', 0.97);
  }
  if (majorEventPattern.test(message)) {
    return resolved('MAJOR_EVENT_ENTRY', 0.96);
  }
  if (maintenanceCreatePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('MAINTENANCE_TASK_CREATE', 0.97);
  }
  if (coveragePattern.test(message)) {
    return resolved('COVERAGE_GAPS', 0.96);
  }
  if (incidentClaimStatusPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('INCIDENT_CLAIM_STATUS', 0.95);
  }
  if (savingsOpportunitiesPattern.test(message)) {
    return resolved('SAVINGS_OPPORTUNITIES', 0.97);
  }
  if (ownershipCostsPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('OWNERSHIP_COSTS', 0.97);
  }
  if (inventoryLookupPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('INVENTORY_LOOKUP', 0.96);
  }
  if ((propertySummaryPattern.test(message) || isPropertyCompletenessRequest(message)) && !explicitCapabilityPattern.test(message)) {
    return resolved('PROPERTY_SUMMARY', 0.96);
  }
  if (homeActionsPattern.test(message) && !explicitCapabilityPattern.test(message) && !maintenancePattern.test(message)) {
    return resolved('HOME_ACTIONS', 0.96);
  }
  if (maintenancePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('MAINTENANCE_STATUS', 0.94);
  }
  if (homeChangeSummaryPattern.test(message) && !explicitCapabilityPattern.test(message) && !/\bdecision\b/i.test(message)) {
    return resolved('HOME_CHANGE_SUMMARY', 0.9);
  }
  if (replacementPattern.test(message)) {
    return resolved('REPLACEMENT_GUIDANCE', 0.96);
  }
  if (refinanceMonitorPattern.test(message)) {
    return resolved('REFINANCE_RATE_MONITOR', 0.98);
  }
  if (refinanceAnalysisPattern.test(message)) {
    return resolved('REFINANCE_ANALYSIS', 0.97);
  }
  if (sellHoldRentAnalysisPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('SELL_HOLD_RENT_ANALYSIS', 0.96);
  }
  if (householdInvitationPattern.test(message)) {
    return resolved('HOUSEHOLD_INVITATION', 0.98);
  }
  if (explicitCapabilityPattern.test(message) || capabilityPattern.test(message)) {
    return resolved('CAPABILITY_DISCOVERY', 0.88);
  }
  return resolved('GROUNDED_GUIDANCE', 0.55);
}
