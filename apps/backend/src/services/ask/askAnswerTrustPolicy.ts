import type { HouseholdRole } from '@prisma/client';
import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import type { ComposedSkillContextEntry } from '../skills/context/skillContext.contract';
import { isAskActionAllowedForHouseholdRole } from './askAudiencePresentation';
import { getAskOperationDefinition, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
import type { AskAnswerTrustEvidence, AskAuthoritativeSourceEvidence } from './askTrust.contract';

type AskAction = Extract<AskPresentationBlock, { type: 'SUMMARY' }>['actions'][number];

const OPERATION_BOUNDARIES: Partial<Record<AskOperationId, ReadonlySet<string>>> = {
  MAINTENANCE_STATUS: new Set(['maintenance-purchase-date-missing', 'maintenance-record-boundary']),
  COVERAGE_GAPS: new Set(['coverage-boundary']),
  OWNERSHIP_COSTS: new Set(['ownership-cost-lens-boundary']),
  HOME_ACTIONS: new Set(['home-actions-boundary', 'focused-home-action-boundary']),
  REPLACEMENT_GUIDANCE: new Set(['repair-replace-boundary']),
  REFINANCE_ANALYSIS: new Set(['refinance-boundary']),
  SELL_HOLD_RENT_ANALYSIS: new Set(['sell-hold-rent-boundary']),
  BREAK_EVEN_ANALYSIS: new Set(['break-even-boundary']),
  NEIGHBORHOOD_CHANGE_FEED: new Set(['neighborhood-change-boundary']),
  PAST_HAZARD_EXPOSURE: new Set(['past-hazard-boundary']),
  HOME_STATUS_BOARD: new Set(['status-board-boundary']),
  HOME_HABITS: new Set(['home-habits-boundary']),
  HOME_DIGITAL_WILL: new Set(['digital-will-boundary']),
  PLANT_CARE_OUTLOOK: new Set(['plant-care-boundary']),
  NEGOTIATION_SHIELD_CASES: new Set(['negotiation-shield-boundary']),
  HOME_UPGRADE_SCENARIOS: new Set(['home-upgrade-boundary']),
  DIY_PROJECTS: new Set(['diy-boundary']),
  PROJECT_TRACKER_PROJECTS: new Set(['project-tracker-boundary']),
  SERVICE_PRICE_CHECKS: new Set(['service-price-radar-boundary']),
  QUOTE_COMPARISON_REVIEW: new Set(['quote-review-boundary']),
  CAPITAL_RESERVE_PLAN: new Set(['capital-plan-boundary']),
  HOME_EVENT_RADAR_FEED: new Set(['home-event-radar-partial']),
  HOME_EVENT_RADAR_STATE: new Set(['radar-write-boundary']),
  HOME_EVENT_RADAR_MARK_DONE: new Set(['radar-write-boundary']),
  HOME_EVENT_RADAR_FEEDBACK: new Set(['radar-write-boundary']),
  HOME_EVENT_RADAR_TASK: new Set(['radar-write-boundary']),
  HOME_EVENT_RADAR_PREFERENCES: new Set(['radar-write-boundary']),
  PROPERTY_TAX_APPEAL_READINESS: new Set(['tax-coverage-boundary', 'tax-readiness-boundary']),
  RENOVATION_PERMIT_READINESS: new Set(['renovation-empty-boundary', 'renovation-readiness-boundary']),
  MAJOR_EVENT_ENTRY: new Set(['major-event-boundary']),
  EMERGENCY_BOUNDARY: new Set(['emergency-boundary']),
  UNSAFE_RESTRICTED_BOUNDARY: new Set(['unsafe-restricted-boundary']),
  OUT_OF_SCOPE_BOUNDARY: new Set(['out-of-scope-boundary']),
  GROUNDED_GUIDANCE: new Set(['grounded-professional-boundary']),
  HVAC_DECISION_START: new Set(['repair-replace-boundary']),
  HVAC_DECISION_SCENARIO: new Set(['repair-replace-boundary']),
  BUYER_PLAN_STATUS: new Set(['buyer-professional-boundary']),
  BUYER_DEADLINES: new Set(['buyer-professional-boundary']),
  BUYER_INSPECTION_REVIEW: new Set(['buyer-professional-boundary']),
  BUYER_FINANCING_READINESS: new Set(['buyer-professional-boundary']),
  BUYER_TITLE_ESCROW_READINESS: new Set(['buyer-professional-boundary']),
  BUYER_WALKTHROUGH_READINESS: new Set(['buyer-walkthrough-boundary']),
  BUYER_DISCLOSURE_FUNDS_READINESS: new Set(['buyer-disclosure-wire-boundary']),
  BUYER_CLOSING_DAY_READINESS: new Set(['buyer-closing-day-wire-boundary']),
  BUYER_CONTRACT_TIMELINE: new Set(['buyer-professional-boundary']),
  BUYER_NEGOTIATION_READINESS: new Set(['buyer-professional-boundary']),
  BUYER_COST_READINESS: new Set(['buyer-cost-boundary']),
};

const OPERATION_ACTION_IDS: Readonly<Partial<Record<AskOperationId, ReadonlySet<string>>>> = {
  MAINTENANCE_STATUS: new Set(['open-maintenance', 'open-seasonal', 'create-maintenance', 'open-maintenance-setup', 'add-purchase-date']),
  MAINTENANCE_TASK_CREATE: new Set(['open-maintenance', 'open-task']),
  MAINTENANCE_TASK_COMPLETE: new Set(['open-maintenance', 'open-task']),
  MAINTENANCE_TASK_UPDATE: new Set(['open-maintenance', 'open-task']),
  COVERAGE_GAPS: new Set(['open-coverage']),
  // + the claim transition item actions (FRD v1.42); the inline claim detail shows only those legal from the live status.
  // FRD v1.43: INSPECTION_FINDINGS had no entry, so even its "Open Inspection Hub" link was stripped; the finding
  // actions are shown in the inline detail only when the live state allows them.
  INSPECTION_FINDINGS: new Set(['open-inspection', 'finding-accept', 'finding-dismiss', 'finding-resolve']),
  INSPECTION_FINDING_UPDATE: new Set(['open-inspection', 'open-finding']),
  INCIDENT_CLAIM_STATUS: new Set(['open-incidents', 'open-claims', 'claim-start', 'claim-submit', 'claim-under-review', 'claim-approve', 'claim-deny', 'claim-close']),
  SAVINGS_OPPORTUNITIES: new Set(['open-savings', 'review-all-savings']),
  OWNERSHIP_COSTS: new Set(['open-ownership-costs']),
  INVENTORY_LOOKUP: new Set(['add-inventory', 'search-inventory', 'open-inventory', 'add-inventory-item']),
  INVENTORY_ITEM_CORRECT: new Set(['open-inventory']),
  HOME_EVENT_CORRECT: new Set(['open-timeline', 'open-home-timeline']),
  HOME_EVENT_VISIBILITY: new Set(['open-timeline', 'open-home-timeline']),
  WARRANTY_CORRECT: new Set(['open-warranties']),
  ROOM_RENAME: new Set(['open-rooms']),
  ROOM_CREATE: new Set(['open-rooms']),
  INVENTORY_ITEM_CREATE: new Set(['open-inventory', 'open-rooms']),
  PROPERTY_CONTEXT_AREA_CAPTURE: new Set(['open-property-record', 'continue-area-capture']),
  // Every action id PROPERTY_SUMMARY actually emits: the record link, one secondary "open the full collection"
  // link per section, and the contributor-only inline "Add a warranty" workflow action.
  PROPERTY_SUMMARY: new Set(['open-property-record', 'open-inventory', 'open-household', 'open-warranties', 'open-rooms', 'open-documents', 'open-home-timeline', 'add-warranty', 'add-timeline-event', 'add-room', 'add-inventory-item']),
  CAPTURE_WARRANTY_CONFIRM: new Set(['open-warranties', 'open-property-record']),
  CAPTURE_EVENT_CONFIRM: new Set(['open-timeline', 'open-home-timeline']),
  HOME_ACTIONS: new Set(['open-home', 'open-home-actions']),
  CAPABILITY_DISCOVERY: new Set(['explore-available-tools', 'explore-tools']),
  REPLACEMENT_GUIDANCE: new Set(['open-inventory', 'open-repair-replace']),
  // FRD v1.45: the analysis also shows the homeowner's own rate monitors (MONITOR renders its own pause/resume/stop).
  REFINANCE_ANALYSIS: new Set(['review-financing', 'open-radar', 'open-profile', 'edit-monitor']),
  REFINANCE_RATE_MONITOR: new Set(['open-radar', 'edit-monitor']),
  SELL_HOLD_RENT_ANALYSIS: new Set(['open-sell-hold-rent']),
  BREAK_EVEN_ANALYSIS: new Set(['open-break-even', 'rerun-break-even-5', 'rerun-break-even-10']),
  NEIGHBORHOOD_CHANGE_FEED: new Set(['open-around-your-home']),
  PAST_HAZARD_EXPOSURE: new Set(['open-home-risk-replay']),
  HOME_STATUS_BOARD: new Set(['open-status-board']),
  HOME_HABITS: new Set(['open-home-habit-coach']),
  HOME_DIGITAL_WILL: new Set(['open-home-digital-will']),
  PLANT_CARE_OUTLOOK: new Set(['open-plant-advisor']),
  NEGOTIATION_SHIELD_CASES: new Set(['open-negotiation-shield']),
  HOME_UPGRADE_SCENARIOS: new Set(['open-home-digital-twin']),
  DIY_PROJECTS: new Set(['open-diy']),
  PROJECT_TRACKER_PROJECTS: new Set(['open-project-tracker']),
  SERVICE_PRICE_CHECKS: new Set(['open-service-price-radar']),
  // FRD v1.44: neither seller-prep operation had an entry, so every action they emitted (even the checklist link) was
  // stripped. The decision item actions are shown inline only when the item's live state allows them.
  SELLER_PREP_CHECKLIST: new Set(['open-seller-prep', 'sale-item-pursue', 'sale-item-unpursue', 'sale-item-waive', 'sale-item-reopen']),
  SELLER_PREP_ITEM_DECISION: new Set(['open-seller-prep']),
  HOUSEHOLD_INVITATION: new Set(['open-household', 'manage-household', 'manage-invitation']),
  GUIDANCE_JOURNEY_CREATE: new Set(['open-journey']),
  QUOTE_COMPARISON_CREATE: new Set(['open-workspace']),
  QUOTE_COMPARISON_REVIEW: new Set(['create-comparison', 'open-comparison']),
  HOME_DEADLINE_MONITOR: new Set(['open-task', 'open-maintenance', 'open-coverage', 'manage-reminder']),
  // FRD v1.47: + open-reserve-fund, the reserve-allocations list's own link, which was always stripped.
  CAPITAL_RESERVE_PLAN: new Set(['open-inventory', 'open-timeline', 'open-timeline-table', 'open-reserve', 'open-reserve-fund', 'rerun-horizon-5', 'rerun-horizon-10']),
  // Item actions on the feed's events (FRD v1.40); the inline detail shows the ones valid for the live state.
  HOME_EVENT_RADAR_FEED: new Set(['open-radar', 'radar-include-dismissed', 'radar-save', 'radar-unsave', 'radar-dismiss', 'radar-restore', 'radar-mark-done', 'radar-feedback', 'radar-plan-task', 'radar-notification-settings']),
  HOME_EVENT_RADAR_STATE: new Set(['open-radar']),
  HOME_EVENT_RADAR_MARK_DONE: new Set(['open-radar']),
  HOME_EVENT_RADAR_FEEDBACK: new Set(['open-radar']),
  HOME_EVENT_RADAR_TASK: new Set(['open-radar', 'open-task']),
  HOME_EVENT_RADAR_PREFERENCES: new Set(['open-radar']),
  PROPERTY_TAX_APPEAL_READINESS: new Set(['open-property-tax']),
  RENOVATION_PERMIT_READINESS: new Set(['start-renovation', 'open-permits', 'open-case']),
  HVAC_DECISION_START: new Set(['open-inventory']),
  HVAC_DECISION_CONTINUE: new Set(['open-inventory']),
  BUYER_PLAN_STATUS: new Set(['open-next-buyer-task', 'open-buyer-plan', 'open-home']),
  // FRD v1.46: + the blocking-task item action; the inline task detail shows it only while the live task is open.
  BUYER_DEADLINES: new Set(['open-buyer-plan', 'open-home', 'buyer-task-complete']),
  BUYER_DOCUMENT_READINESS: new Set(['open-documents', 'open-home']),
  BUYER_INSPECTION_REVIEW: new Set(['open-inspection-hub', 'open-home']),
  BUYER_TASK_COMPLETE: new Set(['open-buyer-plan', 'open-task']),
  BUYER_TASK_CREATE: new Set(['open-buyer-plan', 'open-task']),
  BUYER_TASK_UPDATE: new Set(['open-buyer-plan', 'open-task']),
  BUYER_MOVE_STATUS: new Set(['open-buyer-plan', 'open-home']),
  BUYER_FINANCING_READINESS: new Set(['open-buyer-plan', 'open-home']),
  BUYER_TITLE_ESCROW_READINESS: new Set(['open-buyer-plan', 'open-home']),
  BUYER_WALKTHROUGH_READINESS: new Set(['open-buyer-plan', 'open-home']),
  BUYER_DISCLOSURE_FUNDS_READINESS: new Set(['open-buyer-plan', 'open-home']),
  BUYER_CLOSING_DAY_READINESS: new Set(['open-buyer-plan', 'open-home']),
  BUYER_CONTRACT_TIMELINE: new Set(['open-buyer-plan', 'open-home']),
  BUYER_NEGOTIATION_READINESS: new Set(['open-negotiation', 'open-home']),
  BUYER_COST_READINESS: new Set(['open-buyer-plan', 'open-home']),
  BUYER_FINDING_DISPOSITION: new Set(['open-inspection-hub']),
  BUYER_LIFECYCLE_UPDATE: new Set(['open-buyer-plan']),
};

/**
 * Required context providers participate in canonical source-integrity
 * evaluation even when they fail. Optional providers participate only when
 * they actually returned usable data. An unavailable optional enhancement
 * must not invalidate an otherwise complete canonical read; adapters that
 * explicitly need that enhancement already return a typed limitation state.
 */
export function includeAskContextSourceEvidence(
  entry: Pick<ComposedSkillContextEntry, 'required' | 'status'>,
): boolean {
  return entry.status !== 'NOT_APPLICABLE' && (entry.required || entry.status === 'AVAILABLE');
}

/**
 * Statuses where the adapter completed a real, confident read against its
 * canonical source rather than failing, timing out, or lacking a
 * prerequisite. NOT_APPLICABLE/BLOCKED/NEEDS_ENTITY/NEEDS_CONFIRMATION are
 * not errors -- they are definite outcomes the adapter determined with full
 * data (a cash purchase has no financing to track; a viewer lacks
 * permission; a task needs disambiguation; a mutation is staged and ready).
 * Excluding them here silently strips every safe navigation action on those
 * responses downstream, since isAskActionApplicable requires authoritative
 * evidence. UNAVAILABLE and the terminal failure/pending statuses are
 * deliberately excluded: those genuinely lack a complete canonical read.
 */
const ASK_AUTHORITATIVE_EVIDENCE_STATUSES = new Set([
  'ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS', 'NOT_APPLICABLE', 'BLOCKED', 'NEEDS_ENTITY', 'NEEDS_CONFIRMATION',
]);

export function attachAskAuthoritativeSourceEvidence(
  result: AskOperationResult,
  evidence: AskAuthoritativeSourceEvidence[],
): AskOperationResult {
  const successful = ASK_AUTHORITATIVE_EVIDENCE_STATUSES.has(result.status);
  if (!successful) return result;
  return {
    ...result,
    parameters: {
      ...(result.parameters ?? {}),
      answerTrustEvidence: { schemaVersion: '1.0', sources: evidence } satisfies AskAnswerTrustEvidence,
    },
  };
}

export function completedAskAuthoritativeSourceEvidence(
  operationId: AskOperationId,
  observedAt = new Date().toISOString(),
): AskAuthoritativeSourceEvidence {
  return {
    sourceId: getAskOperationDefinition(operationId).adapterKey,
    operationId,
    status: 'COMPLETE',
    scope: 'FULL',
    freshness: 'CURRENT',
    observedAt,
  };
}

export function readAskAuthoritativeSourceEvidence(result: AskOperationResult): AskAuthoritativeSourceEvidence[] {
  const candidate = result.parameters?.answerTrustEvidence as Partial<AskAnswerTrustEvidence> | undefined;
  if (candidate?.schemaVersion !== '1.0' || !Array.isArray(candidate.sources)) return [];
  return candidate.sources.filter((source): source is AskAuthoritativeSourceEvidence => Boolean(
    source
    && typeof source.sourceId === 'string'
    && typeof source.operationId === 'string'
    && ['COMPLETE', 'PARTIAL', 'UNAVAILABLE'].includes(source.status)
    && ['FULL', 'LIMITED'].includes(source.scope)
    && ['CURRENT', 'STALE', 'UNKNOWN'].includes(source.freshness)
    && typeof source.observedAt === 'string',
  ));
}

export function authoritativeEvidenceState(
  result: AskOperationResult,
  operationId: AskOperationId,
): 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' {
  const definition = getAskOperationDefinition(operationId);
  const matching = readAskAuthoritativeSourceEvidence(result)
    .filter((source) => source.operationId === operationId);
  const adapter = matching.find((source) => source.sourceId === definition.adapterKey);
  if (!adapter || adapter.status !== 'COMPLETE' || adapter.scope !== 'FULL' || adapter.freshness !== 'CURRENT') return 'UNAVAILABLE';
  if (matching.some((source) => source.status !== 'COMPLETE' || source.scope !== 'FULL' || source.freshness !== 'CURRENT')) return 'PARTIAL';
  return 'COMPLETE';
}

export function isBoundaryAllowedForOperation(operationId: AskOperationId, boundaryId: string, result?: AskOperationResult): boolean {
  if (boundaryId === 'ask-audience-applicability') return true;
  if (boundaryId === 'ask-audience-presentation') return Boolean(result && householdRoleFromResult(result));
  return OPERATION_BOUNDARIES[operationId]?.has(boundaryId) ?? false;
}

export function actionsForAskBlock(block: AskPresentationBlock): AskAction[] {
  const actions = 'actions' in block && Array.isArray(block.actions) ? block.actions : [];
  if (block.type === 'PRIORITY_LIST') {
    return [...actions, ...block.items.flatMap((item) => item.cta ? [item.cta] : [])];
  }
  return actions;
}

export function householdRoleFromResult(result: AskOperationResult): HouseholdRole | null {
  const role = (result.parameters?.audiencePresentation as { householdRole?: unknown } | undefined)?.householdRole;
  return role === 'OWNER' || role === 'CONTRIBUTOR' || role === 'VIEWER' ? role : null;
}

export function isAskHrefSafeForProperty(href: string, propertyId?: string | null): boolean {
  if (!href.startsWith('/')) return false;
  if (!propertyId) return true;
  const parsed = new URL(href, 'https://ask.local');
  const pathPropertyId = parsed.pathname.match(/\/dashboard\/properties\/([^/?#]+)/)?.[1];
  const queryPropertyId = parsed.searchParams.get('propertyId');
  if (pathPropertyId && decodeURIComponent(pathPropertyId) !== propertyId) return false;
  if (queryPropertyId && queryPropertyId !== propertyId) return false;
  return true;
}

export function nestedAskHrefs(block: AskPresentationBlock): string[] {
  if (block.type === 'CAPABILITY_LIST') return block.capabilities.map((capability) => capability.href);
  if (block.type === 'GROUPED_LIST') return block.sections.flatMap((section) => section.items.flatMap((item) => item.href ? [item.href] : []));
  if (block.type === 'TIMELINE') return block.items.flatMap((item) => item.href ? [item.href] : []);
  if (block.type === 'CHANGE_SUMMARY') return block.linkedAction ? [block.linkedAction.href] : [];
  if (block.type === 'OUTPUT_ARTIFACTS') return block.items.flatMap((item) => item.navigation ? [item.navigation.href] : []);
  if (block.type === 'RELATED_RECORDS') return block.relationships.flatMap((relationship) => relationship.navigation ? [relationship.navigation.href] : []);
  return [];
}

export function isAskActionApplicable(input: {
  action: AskAction;
  operationId: AskOperationId;
  propertyId?: string | null;
  householdRole: HouseholdRole | null;
  authoritativeSourceAvailable: boolean;
  trustedDynamicAction?: boolean;
}): boolean {
  const { action, operationId, propertyId, householdRole } = input;
  if (action.href && !isAskHrefSafeForProperty(action.href, propertyId)) return false;
  if (householdRole && !isAskActionAllowedForHouseholdRole(action, householdRole)) return false;
  const audienceAction = action.id === 'review-home-journey' && Boolean(householdRole);
  // Journey correction is a safe navigation action owned by audience policy,
  // not by an authoritative operation data source. It must remain available
  // when that policy is explaining why canonical execution did not run.
  if (audienceAction) return true;
  if (!input.authoritativeSourceAvailable) return false;

  // A property-scoped mutation cannot be presented without the audience policy
  // having established the viewer's role. This closes the former same-property
  // loophole while still allowing safe navigation actions.
  const mutation = /^(?:add|archive|cancel|change|complete|confirm|create|delete|disable|edit|enable|forget|invite|manage|mark|monitor|notify|pause|recalculate|record|remove|report|reschedule|run|save|schedule|send|set|start|stop|submit|unlink|update|upload)(?:[-_]|$)/i.test(action.id);
  if (getAskOperationDefinition(operationId).requiresProperty && mutation && !householdRole) return false;
  const focusedHomeAction = operationId === 'HOME_ACTIONS' && action.id.startsWith('home-action-primary-');
  if (!input.trustedDynamicAction && !audienceAction && !focusedHomeAction
    && !(OPERATION_ACTION_IDS[operationId]?.has(action.id) ?? false)) return false;
  return true;
}
