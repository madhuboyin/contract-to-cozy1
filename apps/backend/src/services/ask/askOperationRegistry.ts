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
  // Phase 7 (implementation plan §13; FRD §31 "additional maintenance
  // intelligence" candidate). Reads maintenancePrediction.service.ts's
  // rule-based forecast (MaintenancePrediction rows) -- distinct from
  // MAINTENANCE_STATUS, which only reads homeowner-created/scheduled
  // PropertyMaintenanceTask rows, and from HOME_ACTIONS, which already
  // owns the single governed intelligence/action surface (Personalization
  // Engine, environment insights) and must not get a competing source
  // (confirmed: maintenancePrediction.service.ts has zero references from
  // homeActions.service.ts or the personalization pipeline -- a genuinely
  // standalone, unconnected surface).
  | 'MAINTENANCE_FORECAST'
  | 'COVERAGE_GAPS'
  // Phase 7 (implementation plan §13; FRD §31 coverage/insurance candidate).
  // Distinct from COVERAGE_GAPS's per-inventory-item review: reads the
  // per-policy CoverageComparison (current verified policy vs. alternative
  // quotes/terms, equivalence status, any recorded decision) via the same
  // getOrCreateCoverageComparison call the existing GET
  // /coverage-comparison route already makes. Read-only -- adding an
  // option or recording a decision is a separate, document-dependent,
  // multi-step write deliberately out of scope for this slice.
  | 'COVERAGE_COMPARISON_STATUS'
  | 'INCIDENT_CLAIM_STATUS'
  | 'CLAIM_FILE'
  | 'CLAIM_TRANSITION'
  | 'INCIDENT_CONTINUATION'
  | 'SAVINGS_OPPORTUNITIES'
  | 'OWNERSHIP_COSTS'
  | 'INVENTORY_LOOKUP'
  // Phase 7 (implementation plan §13; FRD §31 "documents" candidate).
  // Reads the Document vault directly (prisma.document, grouped by type
  // and verification status) -- distinct from DOCUMENT_PROMOTION_REVIEW,
  // which only covers pending document-derived extraction candidates, not
  // the document vault itself (confirmed by reading that handler first;
  // neither it nor INVENTORY_LOOKUP/PROPERTY_SUMMARY ever query
  // prisma.document).
  | 'DOCUMENT_LOOKUP'
  | 'PROPERTY_SUMMARY'
  | 'INTELLIGENCE_ENVELOPE_QUERY'
  // ASK_COZY_INLINE_WORKSPACE_FRD Phase 1 cross-cutting, capability-card audit
  // (Appendix D), second reference journey (2026-09-22). Reads
  // radarQueryService.listFeed/getDetail directly -- the SAME canonical read
  // the traditional Home Event Radar page itself calls (via /radar/events,
  // /radar/events/:matchId) -- deliberately NOT a reuse of
  // INTELLIGENCE_ENVELOPE_QUERY, which the FRD explicitly flags as not proof
  // of this specific workflow (wrong item set, filters, and grouping: a
  // cross-domain normalized envelope read, not this property's own radar
  // feed). Read-only: state transitions (save/dismiss/acted-on), structured
  // feedback, and task-candidate/creation writes are a deliberately
  // separate, unscoped follow-up.
  | 'HOME_EVENT_RADAR_FEED'
  // Home Event Radar writes (capability-card audit follow-up, FRD v1.40). Split by consequence per product
  // decision: STATE is a one-click direct write (save/unsave/dismiss/restore -- the caller's own per-user,
  // reversible state with no property-level effect); MARK_DONE (triggers the property's radar risk
  // reconciliation) and FEEDBACK (a reason + comment form) go through review -> confirm -> receipt.
  | 'HOME_EVENT_RADAR_STATE'
  | 'HOME_EVENT_RADAR_MARK_DONE'
  | 'HOME_EVENT_RADAR_FEEDBACK'
  // Home Event Radar task create-or-link and notification settings (FRD v1.41): both form -> review -> confirm.
  | 'HOME_EVENT_RADAR_TASK'
  | 'HOME_EVENT_RADAR_PREFERENCES'
  | 'HOME_ACTIONS'
  | 'OPERATIONAL_WORK_UPDATE'
  | 'INSPECTION_FINDINGS'
  | 'INSPECTION_FINDING_UPDATE'
  | 'DOCUMENT_PROMOTION_REVIEW'
  | 'DOCUMENT_PROMOTION_CONFIRM'
  | 'CAPABILITY_DISCOVERY'
  | 'REPLACEMENT_GUIDANCE'
  | 'REFINANCE_ANALYSIS'
  | 'REFINANCE_RATE_MONITOR'
  | 'SELL_HOLD_RENT_ANALYSIS'
  | 'BREAK_EVEN_ANALYSIS'
  | 'NEIGHBORHOOD_CHANGE_FEED'
  | 'PAST_HAZARD_EXPOSURE'
  | 'HOME_STATUS_BOARD'
  | 'HOME_HABITS'
  | 'HOME_DIGITAL_WILL'
  | 'PLANT_CARE_OUTLOOK'
  | 'NEGOTIATION_SHIELD_CASES'
  | 'HOME_UPGRADE_SCENARIOS'
  | 'DIY_PROJECTS'
  | 'PROJECT_TRACKER_PROJECTS'
  | 'SERVICE_PRICE_CHECKS'
  | 'HOME_TIMELINE_EVENTS'
  | 'MATERIAL_SPECS_LIST'
  | 'PROPERTY_BRIEFS_LIST'
  | 'GUIDANCE_JOURNEYS_LIST'
  | 'HOA_COMPLIANCE_STATUS'
  | 'HOUSEHOLD_INVITATION'
  | 'GUIDANCE_JOURNEY_CREATE'
  | 'QUOTE_COMPARISON_CREATE'
  | 'QUOTE_COMPARISON_REVIEW'
  | 'HOME_DEADLINE_MONITOR'
  | 'CAPITAL_RESERVE_PLAN'
  | 'PROPERTY_TAX_APPEAL_READINESS'
  | 'RENOVATION_PERMIT_READINESS'
  // Phase 7 (implementation plan §13; FRD §31 "Seller Prep — expose now,
  // needs a new Ask operation registration, not new business logic" --
  // SellerPrepService is confirmed UI-decoupled already). Reads the real,
  // canonical PropertySaleCase/SaleReadinessItem checklist directly
  // (PropertySaleCaseService.getCase) -- the same read Phase 6's inline
  // buildSellerPrepInlineBlock already performs, now exposed as its own
  // directly-askable operation with a real, standalone answer rather than
  // only an addendum to a SELL_HOLD_RENT_GOAL_CAPTURE turn.
  | 'SELLER_PREP_CHECKLIST'
  // Phase 7 (implementation plan §13; FRD §31). The real write path
  // PropertySaleCaseService.setItemDecision exposes on a SaleReadinessItem
  // -- WAIVE/PURSUE/REOPEN/UNPURSUE -- deliberately scoped out of Slice 1
  // (SELLER_PREP_CHECKLIST, read-only).
  | 'SELLER_PREP_ITEM_DECISION'
  // ASK_COZY_INLINE_WORKSPACE_FRD Phase 3 write slice: date corrections on an
  // exact InventoryItem (installed / purchased / last serviced), written
  // through the canonical inventoryService.updateItem.
  | 'INVENTORY_ITEM_CORRECT'
  // Phase 3 write slice 2: title/date correction on an exact current
  // HomeEvent, via HomeEventsService.updateHomeEvent's supersede-with-a-new-
  // revision flow (the replacement row gets a NEW id).
  | 'HOME_EVENT_CORRECT'
  // Phase 3 write slice 7: change who can see a timeline event (PRIVATE / HOUSEHOLD / RESALE_PACK), written in place.
  | 'HOME_EVENT_VISIBILITY'
  // Phase 3 write slice 3: provider/expiry-date correction on a Warranty,
  // owner-only (a Warranty belongs to one member's homeownerProfile, and the
  // canonical updateWarranty is scoped to it).
  | 'WARRANTY_CORRECT'
  // Phase 3 write slice 4: rename an InventoryRoom via the canonical
  // inventoryService.updateRoom (plus the controller's stale-analysis markers).
  | 'ROOM_RENAME'
  // Phase 3 add slice: create an InventoryRoom from a declared "Add a room" action (form -> confirmation -> write).
  | 'ROOM_CREATE'
  // Phase 3 add slice: create an InventoryItem from a declared "Add an item" action (form -> confirmation -> write).
  | 'INVENTORY_ITEM_CREATE'
  // Phase 3 add slice 5: fill in the missing facts of one Property Summary area, one confirmed answer at a time.
  | 'PROPERTY_CONTEXT_AREA_CAPTURE'
  | 'MAJOR_EVENT_ENTRY'
  | 'EMERGENCY_BOUNDARY'
  | 'UNSAFE_RESTRICTED_BOUNDARY'
  | 'OUT_OF_SCOPE_BOUNDARY'
  | 'GROUNDED_GUIDANCE'
  | 'HVAC_DECISION_START'
  | 'HVAC_DECISION_CONTINUE'
  // C2C Intelligence & Agentic Evolution Phase 3 / PR 12b (architecture §8 task
  // 2, §22). Routes an Ask "help me decide / why / walk me through" question
  // that references an already-delivered HVAC repair-or-replace Home Action to
  // the Phase 2 Specialist Agent runtime (invokeAgentRuntime), sharing the
  // AgentRun idempotency ledger and canonical DecisionThread with the in-app
  // HomeActionDecisionDetail panel. Generic forward-looking "should I repair or
  // replace my furnace?" with no delivered action stays on HVAC_DECISION_START.
  | 'HVAC_SPECIALIST_ENGAGE'
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
  | 'BUYER_LIFECYCLE_UPDATE'
  // Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §19/§20/§22).
  // Not reachable via ordinary message routing -- created directly in
  // NEEDS_CONFIRMATION status by whatever produces a capture candidate
  // (Phase 3's extraction; a synthetic test harness in this phase). Zero
  // schema change needed for these two string literals (§4.3, verified).
  | 'CAPTURE_FACT_CONFIRM'
  | 'CAPTURE_EVENT_CONFIRM'
  // Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
  // §9/§22). Same non-routable shape as the two operations above -- only
  // ever created paired with a sibling CAPTURE_EVENT_CONFIRM candidate in
  // the same extraction batch (conversationalCapture.ts).
  | 'CAPTURE_WARRANTY_CONFIRM'
  // Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2;
  // FRD §23's UPLOAD_EVIDENCE resolution). Same non-routable, paired-with-
  // CAPTURE_EVENT_CONFIRM shape as CAPTURE_WARRANTY_CONFIRM above.
  | 'CAPTURE_EVIDENCE_CONFIRM'
  // Ask Cozy Stage 3, Phase 6 (implementation plan §12; FRD §21). Same
  // non-routable shape as the three CAPTURE_* operations above, but not a
  // "capture" in their sense -- created directly in COMPLETED status (never
  // NEEDS_CONFIRMATION) by conversationalCapture.ts's GOAL candidate
  // processing, per the materiality carve-out (a DecisionThread is workflow
  // state, reversible at zero cost, not durable knowledge requiring
  // confirmation).
  | 'SELL_HOLD_RENT_GOAL_CAPTURE';

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
  /** False for orchestration-only operations created by trusted internal flows, never from raw message routing. */
  messageRoutable: boolean;
  executionMode: AskExecutionMode;
  safetyClass: AskSafetyClass;
  propertyRoleFloor: AskPropertyRoleFloor;
  adapterKey: string;
  allowedBlockTypes: AskPresentationBlock['type'][];
  evalSuite: string;
  semantic: AskOperationSemanticContract;
}

export const ASK_INTERNAL_OPERATION_IDS: ReadonlySet<AskOperationId> = new Set<AskOperationId>([
  'CAPTURE_FACT_CONFIRM',
  'CAPTURE_EVENT_CONFIRM',
  'CAPTURE_WARRANTY_CONFIRM',
  'CAPTURE_EVIDENCE_CONFIRM',
  'SELL_HOLD_RENT_GOAL_CAPTURE',
  // Inline Workspace Phase 3 correction commands. Fuzzy semantic retrieval scores a plain question such as
  // "When was my water heater last serviced?" or "What is the warranty expiration date for the roof?" as a near
  // match for a correction example (the phrases share the same nouns and date words, and a hard negative cannot
  // outweigh an already-saturated positive), which would route a read question to a write command. These are
  // therefore never candidates for semantic retrieval: they are reached only by an explicit correction-verb
  // pattern (see the *CorrectPattern / roomRenamePattern checks in the deterministic cascade) or by the declared
  // item action a homeowner clicked, which pins the operation.
  'INVENTORY_ITEM_CORRECT',
  'HOME_EVENT_CORRECT',
  'HOME_EVENT_VISIBILITY',
  'WARRANTY_CORRECT',
  'ROOM_RENAME',
  // Reached only by the declared "Add a room" action: there is no message pattern for it and no fuzzy retrieval.
  'ROOM_CREATE',
  // Reached only by the declared "Add an item" action: there is no message pattern for it and no fuzzy retrieval.
  'INVENTORY_ITEM_CREATE',
  // Reached only by the declared "Fill in the missing details" action on a Property Summary completeness row.
  'PROPERTY_CONTEXT_AREA_CAPTURE',
  // Reached only by the declared actions on a Home Event Radar event's inline detail.
  'HOME_EVENT_RADAR_STATE',
  'HOME_EVENT_RADAR_MARK_DONE',
  'HOME_EVENT_RADAR_FEEDBACK',
  // Reached only by "Plan this action" on an event's recommended action, and "Notification settings" on the feed.
  'HOME_EVENT_RADAR_TASK',
  'HOME_EVENT_RADAR_PREFERENCES',
]);

export function isAskMessageRoutableOperation(operationId: AskOperationId): boolean {
  return !ASK_INTERNAL_OPERATION_IDS.has(operationId);
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
  'MAINTENANCE_TASK_UPDATE', 'MAINTENANCE_FORECAST', 'GUIDANCE_JOURNEY_CREATE', 'QUOTE_COMPARISON_CREATE', 'QUOTE_COMPARISON_REVIEW', 'HOME_DEADLINE_MONITOR',
  'CAPITAL_RESERVE_PLAN', 'PROPERTY_TAX_APPEAL_READINESS', 'RENOVATION_PERMIT_READINESS', 'MAJOR_EVENT_ENTRY', 'SELLER_PREP_CHECKLIST', 'SELLER_PREP_ITEM_DECISION', 'INVENTORY_ITEM_CORRECT', 'HOME_EVENT_CORRECT', 'HOME_EVENT_VISIBILITY', 'WARRANTY_CORRECT', 'ROOM_RENAME', 'ROOM_CREATE',
  'COVERAGE_GAPS', 'COVERAGE_COMPARISON_STATUS', 'SAVINGS_OPPORTUNITIES', 'OWNERSHIP_COSTS', 'INVENTORY_LOOKUP', 'DOCUMENT_LOOKUP',
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
    messageRoutable: isAskMessageRoutableOperation(operationId),
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
  MAINTENANCE_TASK_CREATE: definition('MAINTENANCE_TASK_CREATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'maintenance.create', ['SUMMARY', 'WORKFLOW_PROGRESS', 'OUTPUT_ARTIFACTS']),
  MAINTENANCE_TASK_COMPLETE: definition('MAINTENANCE_TASK_COMPLETE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'maintenance.complete', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  MAINTENANCE_TASK_UPDATE: definition('MAINTENANCE_TASK_UPDATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'maintenance.update', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS']),
  MAINTENANCE_FORECAST: definition('MAINTENANCE_FORECAST', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'maintenance.forecast', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE', 'BOUNDARY']),
  COVERAGE_GAPS: definition('COVERAGE_GAPS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'coverage.review', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'BOUNDARY']),
  COVERAGE_COMPARISON_STATUS: definition('COVERAGE_COMPARISON_STATUS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'coverage.comparison-status', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  INCIDENT_CLAIM_STATUS: definition('INCIDENT_CLAIM_STATUS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'incident-claim.status', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE']),
  CLAIM_FILE: definition('CLAIM_FILE', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'incident-claim.file', ['SUMMARY', 'WORKFLOW_PROGRESS', 'LIMITATION', 'BOUNDARY']),
  CLAIM_TRANSITION: definition('CLAIM_TRANSITION', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'incident-claim.transition', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'LIMITATION', 'BOUNDARY']),
  INCIDENT_CONTINUATION: definition('INCIDENT_CONTINUATION', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'incident-claim.continuation', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  SAVINGS_OPPORTUNITIES: definition('SAVINGS_OPPORTUNITIES', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'savings.opportunities', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE']),
  OWNERSHIP_COSTS: definition('OWNERSHIP_COSTS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'ownership.costs', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  INVENTORY_LOOKUP: definition('INVENTORY_LOOKUP', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'inventory.lookup', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE']),
  DOCUMENT_LOOKUP: definition('DOCUMENT_LOOKUP', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'documents.lookup', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE']),
  PROPERTY_SUMMARY: definition('PROPERTY_SUMMARY', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'property.summary', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE']),
  INTELLIGENCE_ENVELOPE_QUERY: definition('INTELLIGENCE_ENVELOPE_QUERY', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'intelligence-envelope.query', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE', 'BOUNDARY']),
  HOME_EVENT_RADAR_FEED: definition('HOME_EVENT_RADAR_FEED', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'home-event-radar.feed', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE', 'BOUNDARY']),
  // VIEWER: the traditional PATCH /radar/events/:matchId/state has no role floor -- this is the caller's own state.
  HOME_EVENT_RADAR_STATE: definition('HOME_EVENT_RADAR_STATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'home-event-radar.state', ['WORKFLOW_PROGRESS', 'BOUNDARY']),
  // CONTRIBUTOR: domain commands have no VIEWER floor, so Ask is stricter than the traditional routes here (FRD v1.40).
  HOME_EVENT_RADAR_MARK_DONE: definition('HOME_EVENT_RADAR_MARK_DONE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'home-event-radar.mark-done', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  HOME_EVENT_RADAR_FEEDBACK: definition('HOME_EVENT_RADAR_FEEDBACK', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'home-event-radar.feedback', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  // CONTRIBUTOR: the same floor as the traditional POST .../actions/:actionCode/task route (FRD v1.41).
  HOME_EVENT_RADAR_TASK: definition('HOME_EVENT_RADAR_TASK', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'home-event-radar.task', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  // CONTRIBUTOR: stricter than the traditional PUT /radar/preferences (no role floor), because domain commands have no VIEWER floor.
  HOME_EVENT_RADAR_PREFERENCES: definition('HOME_EVENT_RADAR_PREFERENCES', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'home-event-radar.preferences', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  // Phase 9B (FRD §17/§21.2) adds PRIORITY_LIST as an additive, versioned
  // explainable annotation of this same operation's existing feed read --
  // deliberately not a new operation, so Ask never presents two ranked
  // views of Home Actions (FRD Phase 9B exit criterion: "no competing
  // action source").
  HOME_ACTIONS: definition('HOME_ACTIONS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'home-actions.feed', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'PRIORITY_LIST', 'BOUNDARY']),
  OPERATIONAL_WORK_UPDATE: definition('OPERATIONAL_WORK_UPDATE', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'home-operations.update', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  INSPECTION_FINDINGS: definition('INSPECTION_FINDINGS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'inspection-findings.review', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE']),
  INSPECTION_FINDING_UPDATE: definition('INSPECTION_FINDING_UPDATE', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'inspection-findings.update', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  DOCUMENT_PROMOTION_REVIEW: definition('DOCUMENT_PROMOTION_REVIEW', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'document-promotion.review', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'EMPTY_STATE']),
  // IW-FRESH-003 fix: LIMITATION added so confirmDocumentPromotionConfirm's
  // "Saved; list could not refresh" reconciliation-failure block (same
  // pattern CLAIM_FILE/CLAIM_TRANSITION already declare) survives
  // askAnswerTrustValidator's allowedBlockTypes filter instead of being
  // silently stripped as DISALLOWED_BLOCK_REMOVED.
  DOCUMENT_PROMOTION_CONFIRM: definition('DOCUMENT_PROMOTION_CONFIRM', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'document-promotion.confirm', ['SUMMARY', 'WORKFLOW_PROGRESS', 'LIMITATION', 'BOUNDARY']),
  CAPABILITY_DISCOVERY: definition('CAPABILITY_DISCOVERY', 'CAPABILITY_DISCOVERY', false, 'DETERMINISTIC', 'STANDARD', null, 'capability.discovery', ['SUMMARY', 'CAPABILITY_LIST']),
  REPLACEMENT_GUIDANCE: definition('REPLACEMENT_GUIDANCE', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'inventory.replacement', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  REFINANCE_ANALYSIS: definition('REFINANCE_ANALYSIS', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'refinance.analysis', ['SUMMARY', 'TABLE', 'EVIDENCE', 'WORKFLOW_PROGRESS', 'MONITOR', 'BOUNDARY']),
  // IW-FRESH-003 fix: LIMITATION added for the same reason as
  // DOCUMENT_PROMOTION_CONFIRM above -- confirmRefinanceRateMonitor's
  // reconciliation-failure block would otherwise be silently stripped.
  REFINANCE_RATE_MONITOR: definition('REFINANCE_RATE_MONITOR', 'MONITOR', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'refinance.monitor', ['SUMMARY', 'MONITOR', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  // FRD Sec22 decision (DECIDED 2026-09-17, Option B --
  // docs/architecture/ASK_COZY_PHASE0_COVERAGE_AUDIT.md SS4.8): DECISION_PROGRESS/
  // WHY_NOW added so this read can surface an existing SELL_HOLD_RENT_GOAL_CAPTURE
  // thread's progress via a read-only selectThread lookup. This operation still
  // never creates or resumes a thread itself -- rollClass in the Phase 0 coverage
  // matrix stays READ_RESULT, not WORKFLOW_CONTINUATION.
  // Capability-card audit (FRD v1.48): the first genuinely new operation for a capability Appendix D found with no
  // Ask operation. Reads BreakEvenService.compute, the same call GET /properties/:id/tools/break-even makes.
  // FRD v1.49: reads getAroundYourHome, the same call GET /properties/:id/around-your-home (Around Your Home) makes.
  // FRD v1.50: reads getPastHazardExposure, the same call GET /properties/:id/past-hazard-exposure (Home Risk Replay)
  // makes, behind the same reviewed-coverage production gate.
  // FRD v1.51: reads listBoard, the same call GET /properties/:id/status-board (Status Board) makes.
  // FRD v1.53: reads listActiveHabits, the same call GET /properties/:id/home-habits (Home Habit Coach) makes.
  // FRD v1.54: reads getByProperty, the same call GET /properties/:id/home-digital-will (Home Continuity Plan) makes,
  // behind the same CONTRIBUTOR floor.
  // FRD v1.55: reads getOutlook, the same call GET /properties/:id/plant-advisor/care-outlook (Plant Advisor's Care tab)
  // makes, including its weather, air-quality, drought and hardiness lookups.
  // FRD v1.56: reads listCasesForProperty, the same call GET /properties/:id/negotiation-shield/cases makes.
  // FRD v1.57: reads listScenarios, the same call GET /properties/:id/home-digital-twin/scenarios makes.
  // FRD v1.58: reads listProjects (planning and in progress), the call GET /properties/:id/diy/projects makes for the page.
  // FRD v1.59: reads listProjects, the call GET /properties/:id/projects makes for the Project Tracker page.
  // FRD v1.60: reads listChecks, the call GET /properties/:id/service-price-radar/checks makes. OWNER floor: the route
  // admits any household member, but listChecks only admits the property's primary homeowner profile.
  // FRD v1.61: reads listHomeEvents, the call GET /properties/:id/home-events makes for the Home Timeline page.
  // FRD v1.62: reads listSpecs, the call GET /properties/:id/materials makes for the Material Specs page.
  // FRD v1.66: reads getAssociation, listApprovalRecords and listViolations, the three GETs the HOA Compliance page makes.
  HOA_COMPLIANCE_STATUS: definition('HOA_COMPLIANCE_STATUS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'hoa-compliance.status', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  // FRD v1.65: reads getPropertyGuidance, the call GET /properties/:id/guidance makes for the Guidance Overview page.
  GUIDANCE_JOURNEYS_LIST: definition('GUIDANCE_JOURNEYS_LIST', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'guidance-overview.journeys', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  // FRD v1.63: reads listPropertyBriefs, the call GET /properties/:id/property-briefs makes for the Property Brief page.
  PROPERTY_BRIEFS_LIST: definition('PROPERTY_BRIEFS_LIST', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'property-brief.briefs', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  MATERIAL_SPECS_LIST: definition('MATERIAL_SPECS_LIST', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'material-specs.list', ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY']),
  HOME_TIMELINE_EVENTS: definition('HOME_TIMELINE_EVENTS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'home-timeline.events', ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY']),
  SERVICE_PRICE_CHECKS: definition('SERVICE_PRICE_CHECKS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'OWNER', 'service-price-radar.checks', ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY']),
  PROJECT_TRACKER_PROJECTS: definition('PROJECT_TRACKER_PROJECTS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'project-tracker.projects', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  DIY_PROJECTS: definition('DIY_PROJECTS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'diy.projects', ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY']),
  HOME_UPGRADE_SCENARIOS: definition('HOME_UPGRADE_SCENARIOS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'home-digital-twin.scenarios', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  NEGOTIATION_SHIELD_CASES: definition('NEGOTIATION_SHIELD_CASES', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'negotiation-shield.cases', ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY']),
  PLANT_CARE_OUTLOOK: definition('PLANT_CARE_OUTLOOK', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'plant-advisor.care-outlook', ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY']),
  HOME_DIGITAL_WILL: definition('HOME_DIGITAL_WILL', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'home-digital-will.read', ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY']),
  HOME_HABITS: definition('HOME_HABITS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'home-habits.read', ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY']),
  HOME_STATUS_BOARD: definition('HOME_STATUS_BOARD', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'status-board.read', ['SUMMARY', 'GROUPED_LIST', 'LIMITATION', 'BOUNDARY']),
  PAST_HAZARD_EXPOSURE: definition('PAST_HAZARD_EXPOSURE', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'home-risk-replay.exposure', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'LIMITATION', 'BOUNDARY']),
  NEIGHBORHOOD_CHANGE_FEED: definition('NEIGHBORHOOD_CHANGE_FEED', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'neighborhood-change.feed', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'LIMITATION', 'BOUNDARY']),
  BREAK_EVEN_ANALYSIS: definition('BREAK_EVEN_ANALYSIS', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'break-even.analysis', ['SUMMARY', 'TABLE', 'EVIDENCE', 'LIMITATION', 'BOUNDARY']),
  SELL_HOLD_RENT_ANALYSIS: definition('SELL_HOLD_RENT_ANALYSIS', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'sale-case.analysis', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY', 'DECISION_PROGRESS', 'WHY_NOW']),
  // IW-FRESH-003 fix: BOUNDARY added to HOUSEHOLD_INVITATION, GUIDANCE_JOURNEY_CREATE,
  // and QUOTE_COMPARISON_CREATE so each one's new reconciliation-failure
  // block (see ASK_MUTATION_IMPACT_MAP / the confirm handlers below) isn't
  // silently stripped by askAnswerTrustValidator or, for QUOTE_COMPARISON_CREATE
  // and HOUSEHOLD_INVITATION (both skill-routed), hit assertSkillResultBlocksAllowed's
  // hard throw -- same second-order gap found and fixed for the earlier
  // reconciliation slice (Documents/Inventory/Buyer/Refinance).
  HOUSEHOLD_INVITATION: definition('HOUSEHOLD_INVITATION', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'OWNER', 'household.invitation', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  GUIDANCE_JOURNEY_CREATE: definition('GUIDANCE_JOURNEY_CREATE', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'guidance.journey.create', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  QUOTE_COMPARISON_CREATE: definition('QUOTE_COMPARISON_CREATE', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'quote-comparison.create', ['SUMMARY', 'WORKFLOW_PROGRESS', 'OUTPUT_ARTIFACTS', 'BOUNDARY']),
  QUOTE_COMPARISON_REVIEW: definition('QUOTE_COMPARISON_REVIEW', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'quote-comparison.review', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  // IW-FRESH-003 fix: BOUNDARY added, same reason as above.
  HOME_DEADLINE_MONITOR: definition('HOME_DEADLINE_MONITOR', 'MONITOR', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'home-deadline.monitor', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  CAPITAL_RESERVE_PLAN: definition('CAPITAL_RESERVE_PLAN', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'capital-reserve.plan', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  PROPERTY_TAX_APPEAL_READINESS: definition('PROPERTY_TAX_APPEAL_READINESS', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'property-tax.appeal-readiness', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  RENOVATION_PERMIT_READINESS: definition('RENOVATION_PERMIT_READINESS', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'renovation-permit.readiness', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'BOUNDARY']),
  SELLER_PREP_CHECKLIST: definition('SELLER_PREP_CHECKLIST', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'seller-prep.checklist', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'BOUNDARY']),
  SELLER_PREP_ITEM_DECISION: definition('SELLER_PREP_ITEM_DECISION', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'seller-prep.item-decision', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  INVENTORY_ITEM_CORRECT: definition('INVENTORY_ITEM_CORRECT', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'inventory.item-correct', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  HOME_EVENT_CORRECT: definition('HOME_EVENT_CORRECT', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'home-event.correct', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  HOME_EVENT_VISIBILITY: definition('HOME_EVENT_VISIBILITY', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'home-event.visibility', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  WARRANTY_CORRECT: definition('WARRANTY_CORRECT', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'warranty.correct', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  ROOM_RENAME: definition('ROOM_RENAME', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'room.rename', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  ROOM_CREATE: definition('ROOM_CREATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'room.create', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  INVENTORY_ITEM_CREATE: definition('INVENTORY_ITEM_CREATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'inventory.create', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  PROPERTY_CONTEXT_AREA_CAPTURE: definition('PROPERTY_CONTEXT_AREA_CAPTURE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'property-context.area-capture', ['SUMMARY', 'WORKFLOW_PROGRESS', 'LIMITATION']),
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
  HVAC_DECISION_CONTINUE: definition('HVAC_DECISION_CONTINUE', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'decision-platform.hvac.continue', ['DECISION_PROGRESS', 'WHY_NOW', 'RECOMMENDATION_CHANGE', 'PREFERENCE_REFERENCE', 'EVIDENCE', 'ASSUMPTIONS', 'LIMITATION', 'EMPTY_STATE']),
  // Phase 3 / PR 12b: adapts to the bounded HVAC Specialist Agent runtime.
  // MATERIAL_DECISION/CONTRIBUTOR mirrors HVAC_DECISION_START because
  // START_OR_RESUME can create or advance the canonical DecisionThread; the
  // adapter surfaces only the bounded run-status projection + decisionThreadId
  // (§7.4), never raw AgentRun / AgentState rows.
  HVAC_SPECIALIST_ENGAGE: definition('HVAC_SPECIALIST_ENGAGE', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'decision-platform.hvac.specialist-engage', ['SUMMARY', 'GROUPED_LIST', 'ASSUMPTIONS', 'LIMITATION', 'EMPTY_STATE', 'BOUNDARY']),
  HVAC_DECISION_SCENARIO: definition('HVAC_DECISION_SCENARIO', 'DECISION_ANALYSIS', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'decision-platform.hvac.scenario', ['SUMMARY', 'SCENARIO_COMPARISON', 'PREFERENCE_REFERENCE', 'LIMITATION', 'BOUNDARY']),
  // IW-FRESH-003 fix: BOUNDARY added, same reason as above.
  HVAC_DECISION_ABANDON: definition('HVAC_DECISION_ABANDON', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'decision-platform.hvac.abandon', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  // Ask Intelligence FRD Phase 8B — confirmed ownership-horizon
  // personalization (FRD §11). Preferences are sensitive/material, hence
  // MATERIAL_DECISION for save; forget/revoke is safety-neutral, matching
  // HVAC_DECISION_ABANDON's STANDARD choice.
  HVAC_PREFERENCE_SAVE: definition('HVAC_PREFERENCE_SAVE', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'decision-platform.hvac.preference.save', ['SUMMARY', 'PREFERENCE_REFERENCE', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  // IW-FRESH-003 fix: BOUNDARY added, same reason as above.
  HVAC_PREFERENCE_FORGET: definition('HVAC_PREFERENCE_FORGET', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'decision-platform.hvac.preference.forget', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  // Ask Intelligence FRD Phase 9A ("What changed?", §16). Pure read-only,
  // mirrors INCIDENT_CLAIM_STATUS's shape: no confirmation, no
  // askDomainCommandRegistry entry, VIEWER floor.
  HOME_CHANGE_SUMMARY: definition('HOME_CHANGE_SUMMARY', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'home-change.summary', ['CHANGE_SUMMARY', 'EMPTY_STATE']),
  // Ask Intelligence FRD Phase 10A (§19, §21.5, §25 "Phase 10A") — outcome
  // observation. STANDARD safety, not MATERIAL_DECISION: recording or
  // disputing a reported outcome never changes a recommendation or ranking
  // (Phase 10A exit criterion: "no production calibration is active" --
  // that only happens in the separate, unbuilt Phase 10B).
  // IW-FRESH-003 fix: BOUNDARY added, same reason as above.
  HVAC_DECISION_OUTCOME_REPORT: definition('HVAC_DECISION_OUTCOME_REPORT', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'decision-platform.hvac.outcome.report', ['SUMMARY', 'OUTCOME_SUMMARY', 'GROUPED_LIST', 'EMPTY_STATE', 'BOUNDARY']),
  HVAC_DECISION_OUTCOME_VIEW: definition('HVAC_DECISION_OUTCOME_VIEW', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'decision-platform.hvac.outcome.view', ['OUTCOME_SUMMARY', 'GROUPED_LIST', 'EMPTY_STATE']),
  // IW-FRESH-003 fix: BOUNDARY added, same reason as above.
  HVAC_DECISION_OUTCOME_UNLINK: definition('HVAC_DECISION_OUTCOME_UNLINK', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'decision-platform.hvac.outcome.unlink', ['SUMMARY', 'WORKFLOW_PROGRESS', 'GROUPED_LIST', 'EMPTY_STATE', 'BOUNDARY']),
  // Home Buyer FRD §13.3. Reads are VIEWER-floor STATUS_SUMMARY/RECORD_QUERY
  // operations grounded in the canonical Buyer Plan overview; the completion
  // command mirrors MAINTENANCE_TASK_COMPLETE's CONTRIBUTOR-floor COMMAND shape.
  BUYER_PLAN_STATUS: definition('BUYER_PLAN_STATUS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'buyer.plan.status', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'BOUNDARY']),
  BUYER_DEADLINES: definition('BUYER_DEADLINES', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'buyer.deadlines', ['SUMMARY', 'GROUPED_LIST', 'BOUNDARY']),
  BUYER_DOCUMENT_READINESS: definition('BUYER_DOCUMENT_READINESS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'buyer.document-readiness', ['SUMMARY', 'EVIDENCE']),
  BUYER_INSPECTION_REVIEW: definition('BUYER_INSPECTION_REVIEW', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'buyer.inspection-review', ['SUMMARY', 'EVIDENCE', 'BOUNDARY']),
  // IW-FRESH-003 fix: LIMITATION added to BUYER_TASK_COMPLETE and
  // BUYER_TASK_UPDATE. Pre-existing gap found while fixing
  // BUYER_LIFECYCLE_UPDATE's own missing reconciliation: confirmBuyerTaskComplete/
  // confirmBuyerTaskUpdate already call reconcileAskExecutionSideEffects and
  // push a "Saved; list could not refresh" LIMITATION block on refresh
  // failure, but neither operation declared LIMITATION here -- since both
  // are routed through the buyer-closing skill, whose
  // resolveEffectiveSkillOperationPolicy intersects the skill's
  // allowedResultBlocks with this list, the undeclared block would have hit
  // assertSkillResultBlocksAllowed's hard throw (turning an already-successful
  // mutation into an apparent confirm failure) instead of degrading honestly
  // per CONF-005. BUYER_TASK_CREATE is unchanged -- it calls no
  // reconciliation mechanism at all and pushes no LIMITATION block, a
  // separate, not-yet-fixed gap outside this fix's scope.
  BUYER_TASK_COMPLETE: definition('BUYER_TASK_COMPLETE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'buyer.task.complete', ['SUMMARY', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  // IW-FRESH-003 fix: LIMITATION added -- matches BUYER_TASK_COMPLETE/UPDATE's
  // own "Saved; list could not refresh" idiom now that this handler also
  // calls reconcileAskExecutionSideEffects.
  BUYER_TASK_CREATE: definition('BUYER_TASK_CREATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'buyer.task.create', ['SUMMARY', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  BUYER_TASK_UPDATE: definition('BUYER_TASK_UPDATE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'buyer.task.update', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS', 'LIMITATION']),
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
  // IW-FRESH-003 fix: LIMITATION added, same reason as BUYER_TASK_CREATE above.
  BUYER_FINDING_DISPOSITION: definition('BUYER_FINDING_DISPOSITION', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'buyer.finding.disposition', ['SUMMARY', 'WORKFLOW_PROGRESS', 'LIMITATION']),
  // Scoped to cancellation and lifecycle-date changes only. The close
  // transition itself is deliberately NOT exposed here -- FRD §14.13/§21.1
  // require the dedicated Closing Day Companion's own wire-fraud/ID/funds
  // checklist and explicit confirmation before RECENT_OWNER; a chat command
  // must not bypass that. Pause is not yet backed by a real lifecycle
  // transition in the service layer, so it is intentionally unavailable
  // rather than simulated (FRD §21.1).
  // IW-FRESH-003 fix: LIMITATION added for the same reason as
  // DOCUMENT_PROMOTION_CONFIRM above -- confirmBuyerLifecycleUpdate's
  // reconciliation-failure block would otherwise be silently stripped.
  BUYER_LIFECYCLE_UPDATE: definition('BUYER_LIFECYCLE_UPDATE', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'buyer.lifecycle.update', ['SUMMARY', 'WORKFLOW_PROGRESS', 'LIMITATION', 'BOUNDARY']),
  // Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §19/§20/§22).
  // MATERIAL_DECISION: these write durable canonical facts/events. Never
  // routed to directly (see the AskOperationId union comment above) -- the
  // propose-time handler exists only so Phase 1's capability registry has
  // no coverage gap; it returns a boundary explaining this, not a
  // confirmation card. The real work happens confirm-time
  // (confirmCapabilityHandlerRegistry.ts).
  // IW-FRESH-003 fix: LIMITATION added to CAPTURE_FACT_CONFIRM and
  // CAPTURE_EVENT_CONFIRM (which now call reconcileAskExecutionSideEffects
  // and can emit a "Saved; list could not refresh" block) for the same
  // reason as DOCUMENT_PROMOTION_CONFIRM above. CAPTURE_WARRANTY_CONFIRM
  // and CAPTURE_EVIDENCE_CONFIRM below are unchanged -- they still don't
  // call the reconciliation mechanism, so they have no such block to allow.
  CAPTURE_FACT_CONFIRM: definition('CAPTURE_FACT_CONFIRM', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'capture.fact.confirm', ['SUMMARY', 'WORKFLOW_PROGRESS', 'LIMITATION', 'BOUNDARY']),
  CAPTURE_EVENT_CONFIRM: definition('CAPTURE_EVENT_CONFIRM', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'capture.event.confirm', ['SUMMARY', 'WORKFLOW_PROGRESS', 'LIMITATION', 'BOUNDARY']),
  CAPTURE_WARRANTY_CONFIRM: definition('CAPTURE_WARRANTY_CONFIRM', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'capture.warranty.confirm', ['SUMMARY', 'WORKFLOW_PROGRESS', 'BOUNDARY']),
  CAPTURE_EVIDENCE_CONFIRM: definition('CAPTURE_EVIDENCE_CONFIRM', 'COMMAND', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'capture.evidence.confirm', ['SUMMARY', 'WORKFLOW_PROGRESS', 'RELATED_RECORDS', 'BOUNDARY']),
  // Ask Cozy Stage 3, Phase 6 (implementation plan §12; FRD §21). safetyClass
  // is STANDARD, not MATERIAL_DECISION, unlike the three CAPTURE_* operations
  // above -- this is the materiality carve-out's own point: attaching/
  // creating a DecisionThread is workflow bookkeeping, reversible at zero
  // cost, and deliberately never confirmation-gated (no
  // askDomainCommandRegistry.ts entry exists for this operation, unlike the
  // three above). Never routed to directly, same shape as the three
  // CAPTURE_* operations -- the propose-time handler exists only so the
  // capability registry has no coverage gap.
  SELL_HOLD_RENT_GOAL_CAPTURE: definition('SELL_HOLD_RENT_GOAL_CAPTURE', 'COMMAND', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'sell-hold-rent.goal-capture', ['SUMMARY', 'DECISION_PROGRESS', 'WHY_NOW', 'GROUPED_LIST', 'BOUNDARY']),
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
const buyerTaskCompletePattern = /\b(?:mark|complete|finish|check off)\b.{0,60}\b(?:buyer (?:plan )?task|closing (?:plan )?task|(?:buyer plan |closing )?checklist item)\b|\b(?:buyer (?:plan )?task|closing (?:plan )?task|(?:buyer plan |closing )?checklist item)\b.{0,60}\b(?:complete|completed|done)\b|\bi(?:'ve| have)?\s+(?:completed|finished)\b.{0,60}\b(?:buyer plan|closing plan) task\b|\bi(?:'ve| have)?\s+(?:completed|finished)\b.{0,60}\bchecklist item\b/i;
const buyerDeadlinesPattern = /\b(?:next deadline|what'?s due|what is due|upcoming deadlines?)\b.{0,40}\b(?:before closing|for closing|closing)\b|\bdeadlines?\b.{0,40}\b(?:before closing|for (?:this|my) (?:purchase|closing))\b|\bwhat could (?:delay|block)\b.{0,40}\b(?:my )?closing\b|\b(?:is|are)\s+anything\b.{0,40}\bclosing\b.{0,20}\bat risk\b|\bclosing\b.{0,40}\b(?:at risk|in jeopardy|in danger)\b|\b(?:at risk|in jeopardy|in danger)\b.{0,40}\bclosing\b/i;
const buyerDocumentReadinessPattern = /\b(?:transaction|closing)\b.{0,40}\bdocuments?\b.{0,50}\b(?:missing|still need|readiness|received)\b|\bwhich (?:transaction |closing )?documents?\b.{0,50}\b(?:missing|before closing|for (?:this|my) closing)\b|\bdocuments?\b.{0,20}\breadiness\b.{0,40}\bclosing\b/i;
const buyerInspectionReviewPattern = /\b(?:inspection )?findings?\b.{0,50}\b(?:need(?:s)? a decision|still need(?:s)? a decision|undecided|need(?:s)? classif(?:y|ication))\b|\breview (?:my |the )?(?:inspection )?findings?\b.{0,30}\b(?:before closing|for (?:this|my) (?:purchase|closing))\b/i;
const buyerPlanStatusPattern = /\b(?:what should i do next|next step)\b.{0,50}\b(?:this purchase|my closing|buying this home|closing plan|buyer plan)\b|\bstatus of (?:my |this )?(?:home )?purchase\b|\bhow close am i\b.{0,40}\bclosing\b|\b(?:closing plan|buyer plan) status\b|\b(?:what should i )?focus on\b.{0,50}\b(?:this week|my closing|this closing|this purchase|closing plan|buyer plan)\b/i;
const buyerTaskCreatePattern = /\b(?:add|create)\b.{0,60}\b(?:to (?:my |the )?(?:buyer plan|closing plan)|as a (?:buyer plan|closing) task)\b|\b(?:add|create) (?:a |an )?(?:buyer plan|closing plan) task\b/i;
const buyerTaskUpdatePattern = /\b(?:reschedule|move|assign|unassign|reassign)\b.{0,60}\b(?:buyer plan|closing plan) task\b|\b(?:buyer plan|closing plan) task\b.{0,60}\b(?:reschedule|assign|due date)\b/i;
const buyerMoveStatusPattern = /\bwhat should i do\b.{0,30}\bbefore (?:i )?move[- ]?in\b|\bmov(?:e|ing)[- ](?:in|out) (?:progress|status|readiness)\b.{0,40}\bpurchase\b|\bmoving\b.{0,40}\b(?:progress|status)\b.{0,30}\b(?:closing|purchase|buyer plan)\b/i;
const buyerFinancingReadinessPattern = /\b(?:financing|lender|loan|underwriting|appraisal)\b.{0,50}\b(?:delay|block|ready|readiness|status|on track)\b.{0,40}\bclosing\b|\bwhat(?:'s| is)\b.{0,30}\b(?:financing|lender|loan|appraisal)\b.{0,30}\bstatus\b/i;
const buyerTitleEscrowReadinessPattern = /\b(?:title|escrow|survey|hoa)\b.{0,50}\b(?:open|outstanding|status|ready|readiness|issues?|block|blocking)\b.{0,40}\b(?:closing|purchase)\b|\bwhat(?:'s| is)\b.{0,30}\bopen\b.{0,30}\b(?:title|escrow)\b/i;
const buyerWalkthroughReadinessPattern = /\bfinal walkthrough\b.{0,50}\b(?:checklist|ready|readiness|prepare|status)\b|\b(?:prepare|ready)\b.{0,40}\bfinal walkthrough\b/i;
const buyerDisclosureFundsReadinessPattern = /\bclosing disclosure\b.{0,50}\b(?:change|changes|ready|readiness|review|status)\b|\bwhat changed\b.{0,40}\bclosing disclosure\b|\bfunds\b.{0,30}\bready\b.{0,30}\bclosing\b|\bclosing\b.{0,30}\bfunds\b.{0,30}\bready\b/i;
const buyerClosingDayReadinessPattern = /\bclosing day\b.{0,50}\b(?:ready|readiness|need|checklist|prepare)\b|\bwhat do i need\b.{0,40}\bclosing day\b|\b(?:prepare|get ready)\b.{0,40}\bclosing day\b/i;
const buyerContractTimelinePattern = /\bcontract\b.{0,50}\b(?:dates?|terms?|timeline|contingenc(?:y|ies))\b.{0,40}\b(?:confirm|need|still|closing)\b|\bwhich contract dates?\b.{0,40}\bconfirm\b|\b(?:confirmed|recorded)\b.{0,30}\bcontract\b.{0,30}\b(?:timeline|dates?|terms?)\b|\bcontingenc(?:y|ies)\b.{0,50}\bcontract\b|\bcontract\b.{0,50}\bcontingenc(?:y|ies)\b/i;
const buyerNegotiationReadinessPattern = /\bwhat should i discuss\b.{0,40}\b(?:my )?agent\b.{0,40}\binspection\b|\bnegotiation\b.{0,40}\b(?:readiness|status|discuss)\b.{0,40}\b(?:closing|purchase|inspection)\b|\bseller (?:response|negotiation)\b.{0,40}\bstatus\b/i;
const buyerCostReadinessPattern = /\bwhat could cost me money\b.{0,40}\b(?:first 90 days|closing|move[- ]in)\b|\bnear[- ]term costs?\b.{0,40}\bpurchase\b|\bwhat (?:will|could)\b.{0,30}\bcost\b.{0,40}\bthis (?:purchase|closing)\b|\bwhat (?:will|could)\b.{0,20}\bthis (?:purchase|closing)\b.{0,20}\bcost\b/i;
const buyerFindingDispositionPattern = /\b(?:move|classify|mark)\b.{0,50}\bfinding\b.{0,50}\b(?:post[- ]close|negotiation|dismiss|verified)\b|\bfinding\b.{0,50}\binto (?:my )?post[- ]close plan\b/i;
const buyerLifecycleUpdatePattern = /\bcancel\b.{0,40}\b(?:this|my)\b.{0,20}\b(?:purchase|buyer plan|closing)\b|\bwe closed today\b|\b(?:change|update|move)\b.{0,40}\b(?:target )?closing date\b.{0,40}\bto\b|\b(?:pause|resume)\b.{0,40}\b(?:this|my)\b.{0,20}\b(?:purchase|buyer plan|deal)\b/i;

const emergencyPattern = /\b(smell(?:ing)? gas|gas smell|gas leak|carbon monoxide|\bco (?:alarm|detector)|sparks?\b.{0,25}\b(?:from|at)\b|electrical fire|actively flooding.*electric(?:al)?|fire now)\b/i;
const unsafeRestrictedPattern = /\b(?:bypass|avoid|evade|skip|work around)\b.{0,60}\b(?:permit|inspection|code|licen[cs]e|hoa|disclosure)\b|\b(?:disable|disconnect|remove|tamper with|cover|block)\b.{0,60}\b(?:smoke|carbon monoxide|co|fire|safety)\s*(?:detector|alarm|device)?\b|\b(?:conceal|hide|omit|misrepresent)\b.{0,80}\b(?:damage|defect|mold|leak|flood|fire|buyer|insurer|inspector|lender)\b|\b(?:remove|alter|cut|demolish|open up)\b.{0,70}\b(?:load[- ]bearing|structural)\b.{0,70}\b(?:wall|beam|column|support)?\b|\b(?:load[- ]bearing|structural)\b.{0,70}\b(?:without|skip|avoid|myself|diy)\b.{0,40}\b(?:inspection|permit|engineer|approval)?\b|\b(?:guarantee|certify|confirm(?: definitively)?|promise|tell me (?:for sure|the exact))\b.{0,100}\b(?:approved|approval|eligible|eligibility|legal|compliant|safe|pass inspection|refinanc|mortgage|loan|insurance claim|tax appeal|damage|loss|claim|covered|coverage|sale price|sell for)\b/i;
const unauthorizedDataAccessPattern = /\b(?:show|list|give|export|send|reveal|access|download|delete|remove)\b.{0,50}\b(?:every|all|another|other)\b.{0,35}\b(?:users?[’']?s?|households?|homeowners?|customers?)\b.{0,45}\b(?:propert(?:y|ies)|records?|documents?|data|accounts?)\b|\b(?:uploaded|attached)\b.{0,40}\b(?:invoice|document|file)\b.{0,50}\b(?:says|instructs?|asks?)\b.{0,50}\b(?:send|share|upload|export)\b.{0,40}\b(?:records?|documents?|data)\b|\b(?:turn on|turn off|enable|disable|change|delete|remove|update|modify)\b.{0,60}\bfor\b.{0,20}\b(?:another|other|someone else'?s?)\b.{0,30}\b(?:users?|households?|homeowners?|customers?|person|member)\b|\b(?:change|modify|update|edit)\b.{0,80}\bpropert(?:y|ies)\b.{0,30}\b(?:i |that i )?(?:cannot|can'?t|do not|don'?t) access\b/i;
const outOfScopePattern = /\b(python|javascript|typescript|coding interview|video game|write (?:me )?(?:a )?program|never[- ]ending loop|system prompt|developer message|ignore\b.{0,20}\b(?:previous|prior) instructions|forget\b.{0,20}\b(?:previous|prior) instructions|override (?:the )?(?:system|developer|safety) instructions|pretend (?:that )?you are|act as (?:dan|an unrestricted)|reveal (?:your |the )?(?:prompt|instructions)|jailbreak|base64[- ]decode (?:this|the prompt)|drop (?:a )?(?:table|database)|(?:run|execute|apply) (?:this |the |a )?(?:sql|database query)|production database|delete (?:every|all) (?:property|user|record)|shell command|malware|ransomware|phishing|steal (?:a )?(?:password|credential)|celebrity news|school essay)\b/i;
const maintenancePattern = /\b(maintenance|maintain|task|tasks|overdue|due soon|what(?:'s| is) due|completed work|pending work|service history|what did (?:i|we) complete|work (?:i |we )?(?:completed|finished)|what should (?:i|we) do before (?:winter|spring|summer|fall|autumn))\b/i;
const maintenanceCreatePattern = /\b(?:create|add|schedule|set up)\b.{0,80}\b(?:maintenance(?: task)?|tasks?|gutter (?:cleaning|inspection)|clean(?:ing)? (?:the )?gutters?|filter change|(?:hvac|furnace|boiler|roof|water heater) (?:service|inspection|cleaning|repair|replacement))\b|\b(?:remind me to|put on my maintenance list)\b/i;
// Deliberately checked before the very broad maintenancePattern below
// (which matches on the bare word "maintenance"/"task" alone and would
// otherwise swallow this) -- requires a forecast/predict/upcoming word
// paired with maintenance, or an explicit "when will X need service"
// phrasing.
const maintenanceForecastPattern = /\b(?:forecast|predict(?:ed|ion|ive)?|upcoming|coming up)\b.{0,50}\bmaintenance\b|\bmaintenance\b.{0,50}\b(?:forecast|predict(?:ed|ion|ive)?|upcoming|coming up|should i expect)\b|\bwhen will (?:my |the )?(?:hvac|furnace|water heater|roof|boiler) need (?:service|maintenance|replacement|attention)\b/i;
const maintenanceCompletePattern = /^\s*(?:please\s+)?(?:(?:mark|set)\b.{0,100}\b(?:task|maintenance|gutter|filter|service|inspection|cleaning|repair)\b.{0,100}\b(?:complete|completed|done)|(?:complete|finish)\b.{0,100}\b(?:task|maintenance|gutter|filter|service|inspection|cleaning|repair))\b|\b(?:i|we) (?:completed|finished)\b.{0,100}\b(?:task|maintenance|gutter|filter|service|inspection|cleaning|repair)\b/i;
// Inventory date correction (Phase 3 write slice). Requires an explicit
// correction verb, one of the three correctable date fields, and an
// inventory/appliance/item noun -- deliberately narrower than
// maintenanceUpdatePattern (which owns bare "update ... service"), and
// checked before it below.
const inventoryItemCorrectPattern = new RegExp(
  // The three date fields keep their original nouns (inventory/item/appliance/system).
  String.raw`\b(?:correct|fix|change|update|edit|set)\b.{0,40}\b(?:install(?:ed|ation)?|purchase[d]?|last[- ]serviced|service[d]?)\s+date\b.{0,60}\b(?:inventory|item|appliance|system)\b`
  + String.raw`|\b(?:inventory|item|appliance|system)\b.{0,60}\b(?:correct|fix|change|update|edit)\b.{0,30}\b(?:install(?:ed|ation)?|purchase[d]?|last[- ]serviced|service[d]?)\s+date\b`
  // The other detail fields require "inventory" or "appliance", not a bare "item"/"system": "edit the notes on this
  // checklist item" must not be captured.
  + String.raw`|\b(?:correct|fix|change|update|edit|set)\b.{0,40}\b(?:condition|brand|manufacturer|model(?:\s+(?:name|number))?|serial(?:\s+(?:number|no))?|(?:purchase|replacement)\s+(?:cost|price|value)|notes?|room|category)\b.{0,60}\b(?:inventory|appliance)\b`
  + String.raw`|\b(?:inventory|appliance)\b.{0,60}\b(?:correct|fix|change|update|edit)\b.{0,30}\b(?:condition|brand|manufacturer|model(?:\s+(?:name|number))?|serial(?:\s+(?:number|no))?|(?:purchase|replacement)\s+(?:cost|price|value)|notes?|room|category)\b`,
  'i',
);
// Timeline event title/date correction (Phase 3 write slice 2). Requires an
// explicit correction verb, title/date/name, and the words "timeline event"
// or "home event" -- checked before the maintenance/inventory patterns.
const homeEventCorrectPattern = /\b(?:correct|fix|change|update|edit)\b.{0,40}\b(?:title|date|name|summary|description|amount|cost|price|type|importance|room|inventory\s+item)\b.{0,40}\b(?:timeline|home)\s+event\b|\b(?:timeline|home)\s+event\b.{0,60}\b(?:correct|fix|change|update|edit)\b.{0,30}\b(?:title|date|name|summary|description|amount|cost|price|type|importance|room|inventory\s+item)\b/i;
// Timeline event visibility (Phase 3 write slice 7): change/make/share/set + private/household/resale/visibility + event.
const homeEventVisibilityPattern = /\b(?:change|make|set|share)\b.{0,40}\b(?:visibility|private|household|resale)\b.{0,40}\b(?:timeline|home)\s+event\b|\b(?:timeline|home)\s+event\b.{0,60}\b(?:change|make|set|share)\b.{0,30}\b(?:visibility|private|household|resale)\b|\b(?:change|make|set|share)\b.{0,40}\b(?:timeline|home)\s+event\b.{0,40}\b(?:visibility|private|household|resale)\b|\bwho\s+can\s+see\b.{0,60}\b(?:timeline|home)\s+event\b/i;
// Warranty provider / expiry-date correction (Phase 3 write slice 3).
const warrantyCorrectPattern = /\b(?:correct|fix|change|update|edit)\b.{0,40}\b(?:provider|expir(?:y|ation|es)|start(?:\s+date)?|coverage\s+(?:type|details)|category|policy(?:\s+number)?|cost|price|premium|details)\b.{0,40}\bwarrant(?:y|ies)\b|\bwarrant(?:y|ies)\b.{0,60}\b(?:correct|fix|change|update|edit)\b.{0,30}\b(?:provider|expir(?:y|ation)|start(?:\s+date)?|coverage\s+(?:type|details)|category|policy(?:\s+number)?|cost|price|premium|details)\b/i;
// Room correction (Phase 3 write slice 4, extended to type and floor level): an explicit rename/correct verb
// for the name, type or floor level, tied to the word "room".
const roomRenamePattern = /\brename\b.{0,40}\broom\b|\b(?:correct|fix|change|update|edit)\b.{0,40}\bname\b.{0,40}\broom\b|\broom\b.{0,60}\b(?:correct|fix|change|update|edit)\b.{0,30}\bname\b|\b(?:correct|fix|change|update|edit)\b.{0,40}\b(?:type|floor(?:\s+level)?)\b.{0,40}\broom\b|\b(?:correct|fix|change|update|edit)\b.{0,40}\broom\s+(?:type|floor(?:\s+level)?)\b|\broom\b.{0,60}\b(?:correct|fix|change|update|edit)\b.{0,30}\b(?:type|floor(?:\s+level)?)\b/i;
const maintenanceUpdatePattern = /\b(?:reschedule|move|change|update|edit|assign|unassign|archive|cancel|reopen|restore)\b.{0,100}\b(?:maintenance|task|gutter|filter|service|inspection|cleaning|repair)\b|\b(?:maintenance|task|gutter|filter|service|inspection|cleaning|repair)\b.{0,100}\b(?:reschedule|assign|archive|cancel|reopen|priority|due date)\b/i;
const guidanceJourneyCreatePattern = /\b(?:start|create|open|begin)\b.{0,50}\b(?:guided plan|guidance journey|guided journey|step-by-step plan)\b/i;
const quoteComparisonCreatePattern = /\b(?:create|start|open|set up)\b.{0,50}\b(?:quote comparison|comparison workspace|workspace for (?:my )?(?:quotes|bids|proposals))\b/i;
const quoteComparisonReviewPattern = /\b(?:compare|review|show|evaluate|which)\b.{0,70}\b(?:quotes?|bids?|proposals?|estimates?)\b|\b(?:quotes?|bids?|proposals?)\b.{0,70}\b(?:compare|comparison|best|cheapest|differences?|review)\b/i;
const homeDeadlineMonitorPattern = /\b(?:notify|alert|remind|monitor|tell me)\b.{0,80}\b(?:(?:important\s+)?home deadlines?|maintenance|task|warranty|insurance|policy|coverage)\b(?:.{0,50}\b(?:due|expire|expires|expiring|renewal)\b)?|\b(?:warranty|insurance|policy|coverage)\b.{0,50}\b(?:expire|expires|expiring|renewal)\b.{0,80}\b(?:notify|alert|remind|monitor|tell me)\b/i;
const capitalReservePattern = /\b(?:capital reserve plan|reserve fund|sinking fund|capital timeline|capital plan|major replacements?|future home expenses?|how much should i save|budget for (?:my )?(?:roof|hvac|systems?|replacements?))\b/i;
const propertyTaxAppealPattern = /\b(?:property tax|assessment|assessed value|tax class|tax exemption)\b.{0,80}\b(?:appeal|contest|challenge|readiness|overassessed|too high|evidence|deadline)\b|\b(?:appeal|contest|challenge)\b.{0,60}\b(?:property tax|assessment|assessed value|tax class|exemption)\b/i;
const renovationPermitPattern = /\b(?:renovation|remodel|addition|project|permit|inspection|hoa)\b.{0,80}\b(?:ready|readiness|start|require|needed|block|blocking|blockers?|compliance|status)\b|\b(?:can i start|am i ready|what is blocking|what are the blockers?)\b.{0,60}\b(?:renovation|remodel|project|work)\b/i;
// Phase 7 (implementation plan §13; FRD §31 "Seller Prep — expose now").
// Deliberately narrower than majorEventPattern's broad "help/guide/prepare/
// plan/checklist ... selling my home" entry-point phrasing (checked below,
// unchanged) -- this targets specific "is my home ready to sell / check my
// sale readiness" phrasing so a real, data-backed checklist answer wins
// over the generic capability-discovery entry point for the phrasing that
// most directly asks for it. Checked BEFORE majorEventPattern in the
// cascade below for exactly that reason -- majorEventEntryResult's own
// suggestion text already says "Check sale readiness" verbatim, which this
// pattern is written to catch.
const sellerPrepChecklistPattern = /\b(?:seller prep|sale readiness|selling readiness|listing readiness)\b|\b(?:am i|are we|is (?:my|this|the) home)\b.{0,25}\bready\b.{0,25}\bto (?:sell|list)\b|\bcheck\b.{0,15}\b(?:sale|seller|selling)\b.{0,15}\breadiness\b/i;
// Phase 7, write-path slice (implementation plan §13; FRD §31). Requires an
// explicit decision verb bidirectionally near "seller prep"/"sale
// readiness"/"checklist" + "item" phrasing -- deliberately narrower than
// sellerPrepChecklistPattern above (a bare "seller prep" mention alone
// stays a checklist READ) and checked BEFORE it in the cascade below, since
// "waive the seller prep item for the roof" would otherwise also match
// sellerPrepChecklistPattern's own bare "seller prep" alternative.
const sellerPrepItemDecisionPattern = /\b(?:waive|pursue|reopen|unpursue)\b.{0,60}\b(?:seller[- ]prep|sale readiness|checklist)\b.{0,20}\bitem\b|\b(?:seller[- ]prep|sale readiness|checklist)\b.{0,20}\bitem\b.{0,60}\b(?:waive|pursue|reopen|unpursue)\b/i;
const majorEventPattern = /\b(?:help|guide|prepare|plan|checklist|what should i do|what do i need)\b.{0,70}\b(?:moving|move in|move out|selling my home|home sale|major renovation|remodeling|insurance claim|storm damage|new baby|aging in place)\b/i;
const coveragePattern = /\b(missing coverage|coverage gaps?|uncovered|warranty coverage|insurance coverage|items? (?:without|missing) (?:a )?(?:warranty|coverage)|warrant(?:y|ies) (?:are )?(?:expire|expiring|expiry)|coverage (?:is )?(?:expire|expiring|expiry)|evidence (?:for|of) (?:my )?(?:expensive|high[ -]?value)? ?(?:appliances?|items?|systems?))\b/i;
// Deliberately checked before coveragePattern in the cascade below:
// "compare my insurance coverage" contains coveragePattern's own bare
// "insurance coverage" alternative, but a compare/switch/shop/equivalent
// verb makes the per-policy comparison the more specific, correct match.
// Bare coverage-gap phrasing with no such verb still falls through to
// coveragePattern untouched.
const coverageComparisonPattern = /\b(?:compar(?:e|ison)|switch(?:ing)?|shop(?:ping)? (?:for|around)|equivalent)\b.{0,50}\b(?:insurance|policy|policies|coverage)\b|\b(?:insurance|policy|policies|coverage)\b.{0,50}\b(?:compar(?:e|ison)|switch(?:ing)?|shop(?:ping)?|equivalent)\b|\bcoverage comparison\b|\bkeep or (?:switch|change) (?:my )?(?:insurance|policy)\b/i;
// Record-query status of already-recorded canonical Incident/Claim rows
// (§9.2 requires "active projects, incidents, claims, permits, and
// inspections" coverage). Deliberately distinct from majorEventPattern's
// guide/prepare/plan/checklist/"what should I do" phrasing (e.g. Appendix
// A's "What do I need for an insurance claim?"), which is a request to
// start/navigate a claim, not a query about existing recorded ones -- that
// pattern is checked earlier in the cascade and wins for that overlap.
const incidentClaimStatusPattern = /\b(?:status of|track|do i have|open|active|recent|pending|filed|submitted)\b.{0,40}\b(?:insurance )?claims?\b|\bclaims?\b.{0,40}\b(?:status|open|active|pending|filed|submitted|history|recorded)\b|\b(?:recorded|logged|detected|any|active|recent|open|new)\b.{0,40}\bincidents?\b|\bincidents?\b.{0,40}\b(?:recorded|logged|detected|history|status|active|recent)\b|\bwhat incidents?\b/i;
const claimFilePattern = /\b(?:file|start|create|open|prepare)\b.{0,60}\b(?:insurance|warranty|manufacturer)?\s*claim\b/i;
const claimTransitionPattern = /\b(?:submit|advance|move|transition|approve|deny|close|reopen)\b.{0,80}\bclaim\b|\bclaim\b.{0,80}\b(?:submit|submitted|under review|approve|approved|deny|denied|close|closed)\b/i;
const incidentContinuationPattern = /\b(?:emergency|incident)\b.{0,80}\b(?:over|contained|resolved|document|record|follow up|claim)\b|\b(?:document|record|follow up on)\b.{0,60}\b(?:emergency|incident)\b/i;
const inspectionFindingUpdatePattern = /\b(?:accept|dismiss|resolve|close|track)\b.{0,80}\binspection (?:finding|issue)\b|\binspection (?:finding|issue)\b.{0,80}\b(?:accept|dismiss|resolve|close|track)\b/i;
const inspectionFindingsPattern = /\b(?:show|review|list|what|open|unresolved)\b.{0,70}\binspection (?:findings?|issues?)\b|\bwhat did (?:the |my )?inspection find\b/i;
const documentPromotionConfirmPattern = /\b(?:confirm|reject|promote|apply)\b.{0,80}\b(?:document|extraction|extracted|policy fact|inspection report)\b/i;
const documentPromotionReviewPattern = /(?:\b(?:show|review|list|what)\b.{0,80}\b(?:document|documnt|extraction|extracted)\b.{0,50}\b(?:review|confirmation|pending|promotion|facts?)\b|\b(?:review|show|list)\b.{0,40}\bpending\b.{0,40}\b(?:document|documnt|extraction)\b)/i;
// Checked after documentPromotionConfirm/ReviewPattern above (both require
// extra review/confirmation/pending/promotion/facts wording this bare
// vault-lookup phrasing never carries) -- "show my documents" is the
// document vault itself, not a pending extraction-candidate queue.
const documentLookupPattern = /\b(?:show|list|see|find|what)\b.{0,40}\b(?:my |the |our )?documents?\b|\bdocuments? (?:do i have|on file|i have)\b|\bhow many documents\b/i;
const operationalWorkUpdatePattern = /\b(?:accept|defer|snooze|complete|finish|dismiss)\b.{0,80}\b(?:operational work|work item|home work|tracked work)\b|\b(?:operational work|work item|tracked work)\b.{0,80}\b(?:accept|defer|snooze|complete|finish|dismiss)\b/i;
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
const homeActionsPattern = /\b(?:what should i do next|what should i do before closing|what needs (?:my |our )?(?:attention|attension)|next best action|highest priority|top priorit(?:y|ies)|home actions?|what can wait|what should i plan|anything urgent|urgent home action|where should i start)\b/i;
// Phase 3 §24.5: a natural observation question about a registered property
// component reads normalized derived intelligence. Detail/history/inventory
// verbs remain owned by INVENTORY_LOOKUP below.
const scopedEnvelopeObservationPattern = /\b(?:what do you know about|what intelligence (?:do you have|is available) (?:about|for)|show (?:derived|registered) intelligence (?:about|for))\b.{0,45}\b(?:my |the )?(?:roof|roofing|foundation|exterior|interior|site|lot|grounds)\b/i;
// ASK_COZY_INLINE_WORKSPACE_FRD Phase 1 cross-cutting, capability-card audit
// (Appendix D), second reference journey. Deliberately checked ahead of
// scopedEnvelopeObservationPattern below (this is more specific: an explicit
// "home event radar"/"radar feed" phrasing, or a monitored-events-near-me
// question) so a genuine radar-feed request doesn't fall through to the
// broader cross-domain envelope reader.
const homeEventRadarFeedPattern = /\b(?:home event radar|radar feed|radar matches?|monitored (?:home )?events?)\b|\bwhat(?:'s| is)\s+(?:happening|going on)\s+(?:near|around)\s+(?:my|this|our)\s+(?:home|property|house)\b|\b(?:severe weather|storm|weather alerts?)\s+(?:near|around)\s+(?:my|this|our)\s+(?:home|property|house)\b/i;
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
// Phase 3 / PR 12b: an Ask engagement with an already-delivered HVAC
// repair-or-replace Home Action -- "help me decide / walk me through" it, or a
// "why is this the recommendation" question, or an explicit reference to a
// flagged/surfaced HVAC action. Checked before hvacDecisionContinuePattern and
// hvacDecisionStartPattern. Deliberately narrower than hvacDecisionStartPattern:
// a bare forward-looking "should I repair or replace my furnace?" has no
// engagement verb / surfaced-action reference and still falls through to
// HVAC_DECISION_START.
const hvacSpecialistEngagePattern = new RegExp(
  `\\b(?:help me decide|walk me through|talk me through|coach me through|guide me through)\\b`
    + `.{0,80}(?:\\b${hvacKeyword}\\b|\\brepair[- ]or[- ]replace\\b|\\brepair or replace\\b)`
    + `.{0,80}\\b(?:action|recommendation|item|decision|flagged|surfaced|home actions?)\\b`
  + `|\\b(?:flagged|recommended|surfaced|raised)\\b.{0,80}\\b${hvacKeyword}\\b`
  + `|\\b${hvacKeyword}\\b.{0,60}\\b(?:action|recommendation|item)\\b.{0,40}\\byou (?:flagged|surfaced|raised|recommended)\\b`
  + `|\\bwhy (?:is|should|would|does)\\b.{0,60}\\b(?:replac\\w+|repair\\w+)\\b.{0,60}\\b${hvacKeyword}\\b.{0,40}\\b(?:recommend\\w+|better|the option|the verdict)\\b`
  + `|\\bwhy (?:is|should|would|does)\\b.{0,40}\\b${hvacKeyword}\\b.{0,60}\\brecommend\\w+\\b`
  + `|\\bwhy (?:are|did|do|would) you\\b.{0,40}\\b(?:recommend\\w+|suggest\\w+)\\b.{0,40}\\b(?:repair\\w+|replac\\w+)\\b`,
  'i',
);
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
// Ownership break-even: when appreciation catches up with cumulative ownership costs. Break-even in another sense
// (a refinance, a solar or energy upgrade, a renovation or a replacement) belongs to those tools, not this one.
// Reviewed local changes around the home (planning, development, zoning, infrastructure, land use, flood maps,
// schools). Weather and hazard events near the home stay with the Home Event Radar ("what is happening near my home"),
// and changes inside the home stay with the home change summary.
const neighborhoodChangePlace = String.raw`(?:my|our|this|the)\s+(?:home|house|property|place|street|block|neighbou?rhood|address)`;
const neighborhoodChangePattern = new RegExp([
  String.raw`\baround your home\b`,
  String.raw`\b(?:construction|development|developments|zoning|rezoning|land use|road ?work|infrastructure|planning (?:application|case)s?|building permits?|permits? (?:filed|issued|applied for)|school (?:zone|boundar(?:y|ies))|flood (?:map|zone) changes?)\b.{0,40}\b(?:near|around|by|close to|next to)\b.{0,15}\b` + neighborhoodChangePlace + String.raw`\b`,
  String.raw`\b(?:what(?:'s| is)|anything)\s+changing\s+(?:around|near)\s+` + neighborhoodChangePlace + String.raw`\b`,
  String.raw`\bchanges?\s+(?:around|near)\s+` + neighborhoodChangePlace + String.raw`\b`,
  String.raw`\bchanges?\s+in\s+(?:my|our|this|the)\s+(?:neighbou?rhood|area|street|block)\b`,
].join('|'), 'i');
// A home's past hazard exposure and long-term hazard context (Home Risk Replay). Current weather near the home stays
// with the Home Event Radar; reporting damage or filing a claim stays with incidents and claims.
// The condition of the home's recorded items (Status Board). Maintenance due, what to do next, replacement decisions
// and coverage stay with their own operations.
// Suggested household habits (Home Habit Coach). Maintenance tasks due and what to do next stay with their own
// operations.
// The HOA records on the HOA Compliance page: the association and dues, approval requests and violations. Whether work
// needs approval (renovation readiness), HOA items at closing (buyer), and reporting or updating a record are not this read.
const hoaCompliancePattern = /\bhoa (?:compliance|records?|approvals?|approval requests?|violations?|dues|fines?|status)\b|\b(?:my|our|the) (?:hoa|homeowners'? association)(?:'s)?\b.{0,40}\b(?:approv\w*|violations?|dues|fines?|records?|say|said|status)\b|\bhoa\b.{0,40}\b(?:approved|denied|violation notice|cure deadline)\b/i;
const hoaComplianceOtherIntentPattern = /\b(?:report|add|submit|file|log|create|new|update|change|mark|delete|remove|should|need|needs|require[sd]?|allowed|can (?:i|we)|closing|purchase|escrow|before (?:i|we) (?:start|build|buy))\b/i;
// The guided journeys already under way on Guidance Overview. Starting one is GUIDANCE_JOURNEY_CREATE (checked earlier);
// skipping, dismissing or completing a step is not this read.
const guidanceJourneysPattern = /\bguidance overview\b|\b(?:guided|guidance) (?:journeys?|plans?)\b|\bstep-by-step plans?\b/i;
const guidanceJourneysOtherIntentPattern = /\b(?:start|create|begin|new|dismiss|skip|complete|finish|cancel|stop|delete|remove)\b|\bmark\b/i;
// The household's saved Property Briefs and their share links. Preparing, sharing, sending, revoking or refreshing a
// brief is not this read, and a "brief summary" of the home is PROPERTY_SUMMARY's.
const propertyBriefsPattern = /\bproperty briefs?\b|\b(?:my|our|saved|shared) (?:home |house )?briefs?\b|\bbrief(?:'s)? (?:share )?links?\b/i;
const propertyBriefsOtherIntentPattern = /\b(?:create|make|prepare|build|generate|new|send|email|revoke|republish|refresh|update|delete|archive|remove)\b|\bshare (?:my|our|the|a|this|it)\b/i;
// The finishes and products recorded in Material Specs ("what paint colour is the living room?"). Choosing, buying or
// adding a material is not this read.
const materialSpecsPattern = /\bmaterial specs?\b|\b(?:my|our|recorded) (?:materials|finishes)\b|\bpaint colou?rs?\b|\bwhat (?:paint|colou?r|tile|flooring|grout|countertops?|cabinets?|wallpaper|siding|trim)\b.{0,50}\b(?:use|used|is|are|did|was|in|on)\b/i;
const materialSpecsOtherIntentPattern = /\b(?:should|recommend|suggest|choose|pick|buy|order|new|add|record|log|best|trend(?:ing|s)?|ideas?)\b/i;
// The whole-home history on the Home Timeline. Recent changes are HOME_CHANGE_SUMMARY, past hazards are
// PAST_HAZARD_EXPOSURE, one item's history is INVENTORY_LOOKUP, and logging or correcting an event is a write.
const homeTimelinePattern = /\bhome timeline\b|\b(?:my|our|the) (?:home|house|property)(?:'s)? (?:timeline|history)\b|\btimeline (?:of|for) (?:my|our|the) (?:home|house|property)\b|\bhistory of (?:my|our|the|this) (?:home|house|property)\b/i;
const homeTimelineOtherIntentPattern = /\b(?:hazards?|floods?|storms?|wildfires?|hurricanes?|log|add|record|correct|fix|change|edit|export|recap)\b/i;
// The household's past Service Price Radar quote checks. Checking a new quote is the page's write; comparing several
// quotes is QUOTE_COMPARISON_*.
const servicePriceChecksPattern = /\bservice price radar\b|\bprice radar\b|\b(?:my|our|past|previous|recent) (?:quote|price) checks?\b|\bquote checks?\b/i;
const servicePriceChecksOtherIntentPattern = /\b(?:new|run|start|create|add|compare)\b/i;
// The household's contractor projects in Project Tracker. DIY projects, renovation permit readiness and starting a
// project are other operations or the page's writes.
const trackedProjectsPattern = /\bproject tracker\b|\b(?:my|our) (?:contractor |home |renovation |remodel(?:ing)? |repair )?projects\b|\bcontractor projects?\b|\bprojects? (?:am i|are we|i am|we are|i'm|we're) tracking\b/i;
const trackedProjectsOtherIntentPattern = /\b(?:diy|do[- ]it[- ]yourself|permits?|ready|readiness|blockers?|blocking|compliance|start|create|new|add)\b/i;
// The household's active DIY projects. Asking whether to do a job yourself is the page's decision engine, and starting a
// project is the page's write; neither is this read.
const diyProjectsPattern = /\bdiy (?:project center|projects?)\b|\b(?:my|our) diy\b|\bdo[- ]it[- ]yourself projects?\b/i;
const diyProjectsOtherIntentPattern = /\b(?:start|create|new|add|begin|should i|can i|or hire|abandon|complete|finish)\b/i;
// The household's saved Home Upgrade Planner (home digital twin) options. Asking whether to repair or replace something
// is REPLACEMENT_GUIDANCE; this is the options already saved in the planner.
const homeUpgradeScenariosPattern = /\bupgrade planner\b|\b(?:home )?digital twin\b|\b(?:my|our) (?:saved )?(?:upgrade|what-if) (?:options|scenarios|plans)\b|\bsaved (?:upgrade|what-if) (?:options|scenarios)\b|\bwhat-if scenarios\b/i;
const homeUpgradeScenariosOtherIntentPattern = /\b(?:create|new|add|start|run|calculate|compute)\b/i;
// The household's Negotiation Shield reviews. Naming the tool always lands here; the generic phrasings step aside for a
// purchase negotiation (BUYER_NEGOTIATION_READINESS, checked earlier) and for starting or comparing something new.
const negotiationShieldNamedPattern = /\bnegotiation shield\b/i;
const negotiationShieldCasesPattern = /\bnegotiation (?:reviews?|cases?)\b|\b(?:my|our) (?:open |saved |past )?negotiations\b/i;
const negotiationShieldCreatePattern = /\b(?:start|create|new|add)\b/i;
const negotiationShieldOtherIntentPattern = /\b(?:closing|purchase|seller|agent|start|new|compare)\b/i;
// Care for the plants and garden zones the household tracks in Plant Advisor. Picking new plants for a room is the
// page's recommendation flow, and "plant" as a verb or a power plant is not this.
const plantCareOutlookPattern = /\bplant advisor\b|\bplant care\b|\b(?:my|our) (?:house ?|indoor |outdoor |potted )?plants\b|\bwater(?:ing)? (?:my|our|the) plants\b|\bgarden zones?\b|\b(?:my|our) garden\b/i;
const plantCareOtherIntentPattern = /\b(?:buy|get|add|recommend|suggest|pick|choose|which|what)\b.{0,20}\bplants? (?:should|to|for|would)\b|\bpower plant|\bplants? (?:for|in) (?:my|the|our) (?:\w+ )?(?:room|bedroom|kitchen|office|bathroom)\b/i;
// The household's Home Continuity Plan (Home Digital Will). A legal will or estate plan is not this.
const homeDigitalWillPattern = /\b(?:home )?continuity plan\b|\bdigital will\b|\bhome (?:handoff|hand-off|hand off) plan\b|\btrusted contacts?\b.{0,30}\b(?:home|house|plan)\b|\b(?:if|when) (?:someone|somebody|anyone) (?:else )?(?:takes? over|has to take over|needs to run)\b.{0,30}\b(?:home|house|place)\b/i;
const homeDigitalWillOtherIntentPattern = /\b(?:estate|probate|attorney|lawyer|legal will|last will|testament|inherit(?:ance)?)\b/i;
const homeHabitsPattern = /\bhabit coach\b|\bhome[- ]care habits?\b|\bhome habits?\b|\bhabits?\b.{0,40}\b(?:home|house|property|place)\b|\b(?:home|house|property)\b.{0,40}\bhabits?\b/i;
const homeStatusBoardPattern = /\bstatus board\b|\b(?:condition|health|state) of (?:my|our|the) (?:appliances|systems|home systems|equipment|home items)\b|\bwhich (?:of (?:my|our) )?(?:appliances|systems|home systems|equipment)\b.{0,30}\b(?:need (?:attention|action)|should i (?:monitor|watch)|are in (?:good|bad|poor) (?:shape|condition))\b|\bhow are (?:my|our) (?:appliances|systems|home systems) (?:doing|holding up)\b/i;
const pastHazardExposurePattern = /\b(?:home )?risk replay\b|\bpast (?:hazards?|storms?|floods?|flooding|wildfires?|disasters?|hazard exposure)\b|\b(?:has|have|did)\s+(?:my|this|our|the)\s+(?:home|house|property)\s+(?:ever\s+)?(?:been|gone)\s+(?:hit|affected|flooded|exposed|through)\b|\b(?:hazards?|disasters?|storms?|floods?|wildfires?|hurricanes?)\b.{0,30}\b(?:has|have)\b.{0,20}\b(?:home|house|property)\b.{0,15}\b(?:been|seen|faced)\b|\bin (?:a|the) flood zone\b/i;
const pastHazardOtherIntentPattern = /\b(?:claim|file|filing|insurance|insurer|policy|coverage|report(?:ing)? (?:the )?damage)\b/i;
const breakEvenAnalysisPattern = /\b(?:break[- ]?even|breaks even|broken even)\b|\b(?:owning|ownership of)\b.{0,40}\bpays? off\b|\b(?:owning|ownership|home|house)\b.{0,40}\b(?:pay|pays|paid) for itself\b/i;
const breakEvenOtherSensePattern = /\b(?:refinanc\w*|mortgage rate|loan estimate|solar|panels?|heat pump|insulation|upgrade|renovat\w*|remodel\w*|project|appliance|replace\w*|quote)\b/i;
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
  // Phase 3 / PR 12b: engagement with an already-delivered HVAC Home Action is
  // checked ahead of the continue/start patterns so "walk me through the HVAC
  // decision from my home actions" reaches the Specialist runtime rather than
  // the direct decisionThreadService path.
  if (hvacSpecialistEngagePattern.test(message)) {
    return resolved('HVAC_SPECIALIST_ENGAGE', 0.95);
  }
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
  if (roomRenamePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('ROOM_RENAME', 0.97);
  }
  if (warrantyCorrectPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('WARRANTY_CORRECT', 0.97);
  }
  if (homeEventCorrectPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('HOME_EVENT_CORRECT', 0.97);
  }
  if (homeEventVisibilityPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('HOME_EVENT_VISIBILITY', 0.97);
  }
  if (inventoryItemCorrectPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('INVENTORY_ITEM_CORRECT', 0.97);
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
  // Naming the tool wins over the quote-comparison phrasings below ("my negotiation shield case for the roof quote");
  // starting a case is the page's write.
  if (negotiationShieldNamedPattern.test(message) && !negotiationShieldCreatePattern.test(message)) {
    return resolved('NEGOTIATION_SHIELD_CASES', 0.96);
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
  if (hoaCompliancePattern.test(message) && !hoaComplianceOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('HOA_COMPLIANCE_STATUS', 0.96);
  }
  if (renovationPermitPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('RENOVATION_PERMIT_READINESS', 0.97);
  }
  if (sellerPrepItemDecisionPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('SELLER_PREP_ITEM_DECISION', 0.97);
  }
  if (sellerPrepChecklistPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('SELLER_PREP_CHECKLIST', 0.97);
  }
  if (majorEventPattern.test(message)) {
    return resolved('MAJOR_EVENT_ENTRY', 0.96);
  }
  if (maintenanceCreatePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('MAINTENANCE_TASK_CREATE', 0.97);
  }
  if (maintenanceForecastPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('MAINTENANCE_FORECAST', 0.96);
  }
  if (coverageComparisonPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('COVERAGE_COMPARISON_STATUS', 0.96);
  }
  if (coveragePattern.test(message)) {
    return resolved('COVERAGE_GAPS', 0.96);
  }
  if (claimTransitionPattern.test(message)) return resolved('CLAIM_TRANSITION', 0.98);
  if (claimFilePattern.test(message)) return resolved('CLAIM_FILE', 0.98);
  if (incidentContinuationPattern.test(message)) return resolved('INCIDENT_CONTINUATION', 0.97);
  if (incidentClaimStatusPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('INCIDENT_CLAIM_STATUS', 0.95);
  }
  if (inspectionFindingUpdatePattern.test(message)) return resolved('INSPECTION_FINDING_UPDATE', 0.98);
  if (inspectionFindingsPattern.test(message)) return resolved('INSPECTION_FINDINGS', 0.96);
  if (documentPromotionConfirmPattern.test(message)) return resolved('DOCUMENT_PROMOTION_CONFIRM', 0.98);
  if (documentPromotionReviewPattern.test(message)) return resolved('DOCUMENT_PROMOTION_REVIEW', 0.96);
  if (documentLookupPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('DOCUMENT_LOOKUP', 0.95);
  }
  if (operationalWorkUpdatePattern.test(message)) return resolved('OPERATIONAL_WORK_UPDATE', 0.98);
  if (diyProjectsPattern.test(message) && !diyProjectsOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('DIY_PROJECTS', 0.96);
  }
  if (guidanceJourneysPattern.test(message) && !guidanceJourneysOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('GUIDANCE_JOURNEYS_LIST', 0.96);
  }
  if (propertyBriefsPattern.test(message) && !propertyBriefsOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('PROPERTY_BRIEFS_LIST', 0.96);
  }
  if (materialSpecsPattern.test(message) && !materialSpecsOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('MATERIAL_SPECS_LIST', 0.96);
  }
  if (homeTimelinePattern.test(message) && !homeTimelineOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('HOME_TIMELINE_EVENTS', 0.96);
  }
  if (servicePriceChecksPattern.test(message) && !servicePriceChecksOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('SERVICE_PRICE_CHECKS', 0.96);
  }
  if (trackedProjectsPattern.test(message) && !trackedProjectsOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('PROJECT_TRACKER_PROJECTS', 0.96);
  }
  if (homeUpgradeScenariosPattern.test(message) && !homeUpgradeScenariosOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('HOME_UPGRADE_SCENARIOS', 0.96);
  }
  if (negotiationShieldCasesPattern.test(message) && !negotiationShieldOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('NEGOTIATION_SHIELD_CASES', 0.96);
  }
  if (plantCareOutlookPattern.test(message) && !plantCareOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('PLANT_CARE_OUTLOOK', 0.96);
  }
  if (homeDigitalWillPattern.test(message) && !homeDigitalWillOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('HOME_DIGITAL_WILL', 0.96);
  }
  if (homeHabitsPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('HOME_HABITS', 0.96);
  }
  if (homeStatusBoardPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('HOME_STATUS_BOARD', 0.96);
  }
  if (pastHazardExposurePattern.test(message) && !pastHazardOtherIntentPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('PAST_HAZARD_EXPOSURE', 0.96);
  }
  if (neighborhoodChangePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('NEIGHBORHOOD_CHANGE_FEED', 0.96);
  }
  if (breakEvenAnalysisPattern.test(message) && !breakEvenOtherSensePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('BREAK_EVEN_ANALYSIS', 0.96);
  }
  if (savingsOpportunitiesPattern.test(message)) {
    return resolved('SAVINGS_OPPORTUNITIES', 0.97);
  }
  if (ownershipCostsPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('OWNERSHIP_COSTS', 0.97);
  }
  if (homeEventRadarFeedPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('HOME_EVENT_RADAR_FEED', 0.96);
  }
  if (scopedEnvelopeObservationPattern.test(message)) {
    return resolved('INTELLIGENCE_ENVELOPE_QUERY', 0.96);
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
