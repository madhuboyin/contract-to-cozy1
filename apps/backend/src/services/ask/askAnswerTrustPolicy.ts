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
  QUOTE_COMPARISON_REVIEW: new Set(['quote-review-boundary']),
  CAPITAL_RESERVE_PLAN: new Set(['capital-plan-boundary']),
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
  MAINTENANCE_STATUS: new Set(['open-maintenance', 'open-seasonal', 'create-maintenance', 'add-purchase-date']),
  MAINTENANCE_TASK_CREATE: new Set(['open-maintenance', 'open-task']),
  MAINTENANCE_TASK_COMPLETE: new Set(['open-maintenance', 'open-task']),
  MAINTENANCE_TASK_UPDATE: new Set(['open-maintenance', 'open-task']),
  COVERAGE_GAPS: new Set(['open-coverage']),
  INCIDENT_CLAIM_STATUS: new Set(['open-incidents', 'open-claims']),
  SAVINGS_OPPORTUNITIES: new Set(['open-savings', 'review-all-savings']),
  OWNERSHIP_COSTS: new Set(['open-ownership-costs']),
  INVENTORY_LOOKUP: new Set(['add-inventory', 'search-inventory', 'open-inventory']),
  PROPERTY_SUMMARY: new Set(['open-property-record']),
  HOME_ACTIONS: new Set(['open-home', 'open-home-actions']),
  CAPABILITY_DISCOVERY: new Set(['explore-available-tools', 'explore-tools']),
  REPLACEMENT_GUIDANCE: new Set(['open-inventory', 'open-repair-replace']),
  REFINANCE_ANALYSIS: new Set(['review-financing', 'open-radar', 'open-profile']),
  REFINANCE_RATE_MONITOR: new Set(['open-radar', 'edit-monitor', 'pause-monitor', 'stop-monitor']),
  SELL_HOLD_RENT_ANALYSIS: new Set(['open-sell-hold-rent']),
  HOUSEHOLD_INVITATION: new Set(['open-household', 'manage-household', 'manage-invitation']),
  GUIDANCE_JOURNEY_CREATE: new Set(['open-journey']),
  QUOTE_COMPARISON_CREATE: new Set(['open-workspace']),
  QUOTE_COMPARISON_REVIEW: new Set(['create-comparison', 'open-comparison']),
  HOME_DEADLINE_MONITOR: new Set(['open-task', 'open-maintenance', 'open-coverage', 'manage-reminder']),
  CAPITAL_RESERVE_PLAN: new Set(['open-inventory', 'open-timeline', 'open-timeline-table', 'open-reserve']),
  PROPERTY_TAX_APPEAL_READINESS: new Set(['open-property-tax']),
  RENOVATION_PERMIT_READINESS: new Set(['start-renovation', 'open-permits', 'open-case']),
  HVAC_DECISION_START: new Set(['open-inventory']),
  HVAC_DECISION_CONTINUE: new Set(['open-inventory']),
  BUYER_PLAN_STATUS: new Set(['open-next-buyer-task', 'open-buyer-plan', 'open-home']),
  BUYER_DEADLINES: new Set(['open-buyer-plan', 'open-home']),
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

export function attachAskAuthoritativeSourceEvidence(
  result: AskOperationResult,
  evidence: AskAuthoritativeSourceEvidence[],
): AskOperationResult {
  const successful = ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'].includes(result.status);
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
