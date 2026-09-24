import { canonicalCapabilityRegistry } from '../../productFramework/capabilities/canonicalCapabilityRegistry';
import type { AskOperationId } from './askOperationRegistry';
import { ASK_OPERATION_DEFINITIONS } from './askOperationRegistry';

// These are entry reads, not claims that the corresponding tool journey is
// inline-complete. Keep this allowlist narrower than the capability registry.
const INLINE_ENTRY_READS = {
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
} as const satisfies Record<string, { operationId: AskOperationId; message: string }>;

export function capabilityCardLaunch(capabilityId: string) {
  if (!canonicalCapabilityRegistry.getById(capabilityId)) throw new Error(`Unknown Ask capability: ${capabilityId}`);
  const entry = INLINE_ENTRY_READS[capabilityId as keyof typeof INLINE_ENTRY_READS];
  if (entry) {
    if (!ASK_OPERATION_DEFINITIONS[entry.operationId]) throw new Error(`Unregistered Ask operation: ${entry.operationId}`);
    return { inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE' as const, operationId: entry.operationId, message: entry.message }, inlineBoundary: 'You can inspect current records here. Further tool actions may still require opening the full page.' };
  }
  return { inlineLaunch: null, inlineBoundary: 'This tool’s full journey is not available inside Ask Cozy yet.' };
}
