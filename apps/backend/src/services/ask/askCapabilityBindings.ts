// The ONE place Ask binds a canonical capability to the Ask operation and launch message that serves it (capability discovery plan,
// Phase 5; Inline Workspace FRD IW-SHELL-020). Two kinds of binding live here, side by side:
//   - CARD_ENTRY_BINDINGS: the single "entry read" a capability CARD launches inline (moved here unchanged from askCapabilityCardLaunch.ts).
//   - ASK_DISCOVERY_BINDINGS: the reviewed entry points Explore with Cozy and "More ideas" offer. A capability may have several.
// A binding holds ONLY Ask-specific facts. Identity, outcome group, homeowner label and description, approved aliases and the completion
// definition belong to the capability registry; availability, audience, authorization, safety and launch behaviour belong to the Ask
// operation registry; and operation-to-capability ownership is the validated skill guidance bridge. askExplorerRegistry.ts derives the rest
// and rejects any binding that restates it.
import { DIY_TEMPLATE_BROWSE_ACTION } from '../diy/projectGuide';
import type { AskOperationId } from './askOperationRegistry';
import { PROPERTY_SUMMARY_COMPLETENESS_STARTER_MESSAGE, PROPERTY_SUMMARY_STARTER_MESSAGE } from './suggestedActions/starterCandidates';
import { SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE } from './support/seasonalHomeCare';

// These are entry reads, not claims that the corresponding tool journey is
// inline-complete. Keep this allowlist narrower than the capability registry.
export const CARD_ENTRY_BINDINGS = {
  maintenance: { operationId: 'MAINTENANCE_STATUS', message: 'Show maintenance tasks for this home' },
  documents: { operationId: 'DOCUMENT_LOOKUP', message: 'Show documents for this home' },
  'home-records': { operationId: 'PROPERTY_SUMMARY', message: 'Show this home’s records' },
  // Capability-card audit (FRD Appendix D), second reference journey
  // (2026-09-22). Deliberately points at HOME_EVENT_RADAR_FEED, a new
  // operation reading the real canonical radar feed/detail directly -- NOT
  // INTELLIGENCE_ENVELOPE_QUERY, which the audit already flagged as not
  // proof of this specific workflow.
  'home-event-radar': { operationId: 'HOME_EVENT_RADAR_FEED', message: 'Show my home event radar feed' },
  // Capability-card audit, first candidate slice (FRD v1.42): the claims-only view of INCIDENT_CLAIM_STATUS, with
  // inline claim detail and the existing confirmed CLAIM_TRANSITION as declared actions.
  claims: { operationId: 'INCIDENT_CLAIM_STATUS', message: 'Show my claims' },
  // Second candidate slice (FRD v1.43): open inspection findings, with inline finding detail and the existing
  // confirmed INSPECTION_FINDING_UPDATE (accept as work / dismiss / resolve) as declared actions.
  'inspection-hub': { operationId: 'INSPECTION_FINDINGS', message: 'Show my open inspection findings' },
  // Third candidate slice (FRD v1.44): the sale readiness checklist, with inline item detail and the existing confirmed
  // SELLER_PREP_ITEM_DECISION (pursue / stop pursuing / disclose and waive / reopen) as declared actions.
  'seller-prep': { operationId: 'SELLER_PREP_CHECKLIST', message: 'Check my sale readiness' },
  // Fourth candidate slice (FRD v1.45): the refinance analysis, which now also shows the homeowner's own rate monitors
  // with their pause / resume / stop. It has no item list, so there is no inline detail.
  'mortgage-refinance-radar': { operationId: 'REFINANCE_ANALYSIS', message: 'Is refinancing worth reviewing now?' },
  // Fifth candidate slice (FRD v1.46), first cut of buyer-closing: the deadlines list, with blocking tasks opening inline
  // and the existing confirmed BUYER_TASK_COMPLETE as a declared action.
  'buyer-closing': { operationId: 'BUYER_DEADLINES', message: 'What is due before closing?' },
  // FRD v1.47: two capabilities the Appendix D audit listed as having no Ask operation, whose page reads the same
  // canonical source as an existing one. Both are partial (see the FRD row): the reserve plan shows the fund's
  // shortfall and allocations but not its contributions; the readiness answer covers one renovation case.
  'reserve-fund': { operationId: 'CAPITAL_RESERVE_PLAN', message: 'How is my reserve fund doing?' },
  'home-renovation-risk-advisor': { operationId: 'RENOVATION_PERMIT_READINESS', message: 'Is my renovation ready to start?' },
  // FRD v1.48: backed by a new operation reading the same BreakEvenService the Break-Even page reads.
  'break-even': { operationId: 'BREAK_EVEN_ANALYSIS', message: 'Show my home break-even analysis' },
  // FRD v1.49: backed by a new operation reading the same getAroundYourHome the Around Your Home page reads.
  'neighborhood-change-radar': { operationId: 'NEIGHBORHOOD_CHANGE_FEED', message: "What's changing around my home?" },
  // FRD v1.50: backed by a new operation reading the same getPastHazardExposure the Home Risk Replay page reads.
  'home-risk-replay': { operationId: 'PAST_HAZARD_EXPOSURE', message: 'Show my home risk replay' },
  // FRD v1.51: backed by a new operation reading the same listBoard the Status Board page reads.
  'status-board': { operationId: 'HOME_STATUS_BOARD', message: 'Show my status board' },
  // FRD v1.53: backed by a new operation reading the same listActiveHabits the Home Habit Coach page reads.
  'home-habit-coach': { operationId: 'HOME_HABITS', message: 'Show my home habits' },
  // FRD v1.54: backed by a new operation reading the same getByProperty the Home Continuity Plan page reads.
  'home-digital-will': { operationId: 'HOME_DIGITAL_WILL', message: 'Show my home continuity plan' },
  // FRD v1.55: backed by a new operation reading the same getOutlook Plant Advisor's Care tab reads.
  'plant-advisor': { operationId: 'PLANT_CARE_OUTLOOK', message: 'Show my plant care outlook' },
  // FRD v1.56: backed by a new operation reading the same listCasesForProperty the Negotiation Shield case list reads.
  'negotiation-shield': { operationId: 'NEGOTIATION_SHIELD_CASES', message: 'Show my negotiation shield cases' },
  // FRD v1.57: backed by a new operation reading the Home Upgrade Planner's saved scenarios (listScenarios).
  'home-digital-twin': { operationId: 'HOME_UPGRADE_SCENARIOS', message: 'Show my upgrade planner options' },
  // FRD v1.58: backed by a new operation reading the DIY page's active-project list (listProjects).
  diy: { operationId: 'DIY_PROJECTS', message: 'Show my DIY projects' },
  // FRD v1.59: backed by a new operation reading the Project Tracker page's list (listProjects).
  'project-tracker': { operationId: 'PROJECT_TRACKER_PROJECTS', message: 'Show my project tracker' },
  // FRD v1.60: backed by a new operation reading the Service Price Radar page's recent checks (listChecks).
  'service-price-radar': { operationId: 'SERVICE_PRICE_CHECKS', message: 'Show my service price radar' },
  // FRD v1.61: backed by a new operation reading the Home Timeline page's events (listHomeEvents).
  'home-timeline': { operationId: 'HOME_TIMELINE_EVENTS', message: 'Show my home timeline' },
  // FRD v1.62: backed by a new operation reading the Material Specs page's list (listSpecs).
  'material-specs': { operationId: 'MATERIAL_SPECS_LIST', message: 'Show my material specs' },
  // FRD v1.63: backed by a new operation reading the Property Brief page's saved briefs (listPropertyBriefs).
  'property-brief': { operationId: 'PROPERTY_BRIEFS_LIST', message: 'Show my property briefs' },
  // FRD v1.64 (product option A): Emergency Help launches the incident and claim follow-up read; the page's AI
  // troubleshooter is a labelled handoff on that answer, not a model call inside Ask.
  emergency: { operationId: 'INCIDENT_CONTINUATION', message: 'Follow up on a home emergency' },
  // FRD v1.65 (product option A): backed by a new operation reading the Guidance Overview page's journeys
  // (getPropertyGuidance).
  'guidance-overview': { operationId: 'GUIDANCE_JOURNEYS_LIST', message: 'Show my guided journeys' },
  // FRD v1.66: backed by a new operation reading the HOA page's association, approval records and violations.
  'hoa-compliance': { operationId: 'HOA_COMPLIANCE_STATUS', message: 'Show my HOA records' },
  // FRD v1.67: backed by a new operation reading the Price Finalization page's saved records (listForProperty).
  'price-finalization': { operationId: 'PRICE_FINALIZATIONS_LIST', message: 'Show my price finalizations' },
  // FRD v1.68: backed by a new operation reading the Do-Nothing Simulator's latest run and saved scenarios.
  'do-nothing-simulator': { operationId: 'DO_NOTHING_SIMULATION', message: 'Show my do-nothing simulation' },
  // FRD v1.70 (product option A): the calculated parts of two Gemini-backed tools, without the model call. The AI
  // recommendations stay on each page behind a labelled link.
  oracle: { operationId: 'APPLIANCE_FAILURE_RISK', message: 'Show my appliance oracle' },
  budget: { operationId: 'MAINTENANCE_BUDGET_FORECAST', message: 'Show my budget planner' },
} as const satisfies Record<string, { operationId: AskOperationId; message: string }>;

export interface AskCapabilityBinding {
  /** Stable discovery entry id (telemetry and topic starters reference it). */
  id: string;
  capabilityId: string;
  operationId: AskOperationId;
  /** The reviewed message a selection sends. */
  question: string;
  interactionType: 'CONVERSATION_CONTINUE' | 'START_WORKFLOW';
  /** MESSAGE: the question resolves to the operation by itself. DECLARED_OPERATION: an internal operation reached only through the launch context. */
  launch: 'MESSAGE' | 'DECLARED_OPERATION';
  /** READ is an Ask-native read; GOVERNED_WORKFLOW only begins a confirmation-gated capture, proposal or review. */
  kind: 'READ' | 'GOVERNED_WORKFLOW';
  /** Required for GOVERNED_WORKFLOW: what selecting it does and that nothing is saved until the homeowner confirms. */
  consequence?: string;
  /** Optional Ask-specific presentation override: the outcome-shaped phrasing shown instead of the capability's own label. */
  label?: string;
}

const read = (
  id: string, capabilityId: string, operationId: AskOperationId, question: string, label: string,
  options: { launch?: AskCapabilityBinding['launch']; interactionType?: AskCapabilityBinding['interactionType'] } = {},
): AskCapabilityBinding => ({
  id, capabilityId, operationId, question, label, kind: 'READ',
  launch: options.launch ?? 'MESSAGE', interactionType: options.interactionType ?? 'CONVERSATION_CONTINUE',
});

// Entry ids are stable identifiers (telemetry, topic starters), so they keep their original names even where the derived group differs from the
// id's prefix (for example `protect-coverage` now sits with its capability's outcome, Compare and decide).
export const ASK_DISCOVERY_BINDINGS: readonly AskCapabilityBinding[] = Object.freeze([
  read('understand-summary', 'property-brief', 'PROPERTY_SUMMARY', PROPERTY_SUMMARY_STARTER_MESSAGE, 'Summarize my home record'),
  read('understand-completeness', 'property-brief', 'PROPERTY_SUMMARY', PROPERTY_SUMMARY_COMPLETENESS_STARTER_MESSAGE, 'How complete is my home record?'),

  read('maintain-attention', 'home-operations', 'HOME_ACTIONS', 'What needs my attention at home?', 'What needs attention?'),
  read('maintain-due', 'maintenance', 'MAINTENANCE_STATUS', 'What maintenance tasks are due this month?', 'What maintenance is coming due?'),
  read('maintain-forecast', 'maintenance', 'MAINTENANCE_FORECAST', 'What maintenance is coming up for my home?', 'What maintenance should I expect soon?'),
  read('maintain-seasonal', 'seasonal-maintenance', 'SEASONAL_HOME_CARE', SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE, 'Home care for this season', { launch: 'DECLARED_OPERATION', interactionType: 'START_WORKFLOW' }),
  read('maintain-next-season', 'seasonal-maintenance', 'SEASONAL_HOME_CARE', SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, 'Get ready for next season', { launch: 'DECLARED_OPERATION', interactionType: 'START_WORKFLOW' }),
  read('maintain-diy', 'diy', 'DIY_PROJECTS', 'Show my DIY projects', 'Show my DIY projects'),
  read('maintain-diy-start', 'diy', 'DIY_TEMPLATE_BROWSE', DIY_TEMPLATE_BROWSE_ACTION.message, 'Find a project I can start', { launch: 'DECLARED_OPERATION', interactionType: 'START_WORKFLOW' }),
  {
    id: 'maintain-create-task', capabilityId: 'maintenance', operationId: 'MAINTENANCE_TASK_CREATE', question: 'Create a maintenance task', label: 'Add a maintenance task',
    kind: 'GOVERNED_WORKFLOW', interactionType: 'START_WORKFLOW', launch: 'MESSAGE',
    consequence: 'Cozy asks for the details and shows a review first. Nothing is saved until you confirm.',
  },

  read('protect-coverage', 'coverage-intelligence', 'COVERAGE_GAPS', 'Which items are missing coverage?', 'Which items are missing coverage?'),
  read('protect-changes', 'home-briefing', 'HOME_CHANGE_SUMMARY', 'What changed recently for this home?', 'What changed recently for this home?'),

  read('save-opportunities', 'savings-benefits', 'SAVINGS_OPPORTUNITIES', 'Where could I save money on this home?', 'Where could I save money?'),
  read('save-costs', 'ownership-costs', 'OWNERSHIP_COSTS', 'What are my biggest ownership costs?', 'What are my biggest ownership costs?'),

  // `quote-comparison` is a workflow-only capability (CAP-FR-035), so its review is not offered as a general idea; the validator rejects a binding to it.

  read('plan-reserve', 'capital-timeline', 'CAPITAL_RESERVE_PLAN', 'How is my reserve fund doing?', 'How is my reserve fund doing?'),
]);

/**
 * Card entry reads whose capability the validated skill guidance bridge does NOT assign to that operation, found when the binding layers were
 * unified (2026-10-09). They are kept as they were, not silently "fixed": `documents` has no bridge entry for DOCUMENT_LOOKUP, and the bridge
 * assigns PROPERTY_SUMMARY to `property-brief` and CAPITAL_RESERVE_PLAN to `capital-timeline`. validateAskCapabilityBindings fails if a listed
 * disagreement stops being true (so the list cannot rot) or an unlisted one appears (so a new one cannot slip in).
 */
export const KNOWN_CARD_BRIDGE_DISAGREEMENTS: Readonly<Record<string, AskOperationId>> = Object.freeze({
  documents: 'DOCUMENT_LOOKUP',
  'home-records': 'PROPERTY_SUMMARY',
  'reserve-fund': 'CAPITAL_RESERVE_PLAN',
});
