import type { HomeAction } from '../../../productFramework/homeAction.contract';
import type { ProposedWorkItem } from '../domain/sourceAdapter';
import type { WorkSubject } from '../domain/workKey';
import { resolveWorkKey } from '../domain/workKey';
import { listGuidanceSafetyClassifications } from '../../../services/guidanceEngine/guidanceGovernance.catalog';
import type { OperationalObligationType } from '@prisma/client';
import { WORK_ITEM_ELIGIBLE_SOURCE_KINDS, SOURCE_TYPE_BY_KIND } from '../../../services/intelligence/homeActionAdapterOwnership';

export { WORK_ITEM_ELIGIBLE_SOURCE_KINDS } from '../../../services/intelligence/homeActionAdapterOwnership';

/**
 * The seasonal-checklist HomeAction is an aggregate over many items (see
 * §5.6 of the parent plan) — mapping one aggregate to one work item would
 * be semantically wrong. Un-aggregating seasonal work into individual work
 * items is Slice 3's job ("Maintenance, seasonal, and routines
 * convergence"); until then it stays a pure view link.
 */
function isSeasonalAggregate(action: HomeAction): boolean {
  return action.id.startsWith('seasonal-checklist:');
}

export function isWorkItemEligible(action: HomeAction): boolean {
  if (!WORK_ITEM_ELIGIBLE_SOURCE_KINDS.has(action.source.kind)) return false;
  if (isSeasonalAggregate(action)) return false;
  return true;
}

function isCoverageShaped(action: HomeAction): boolean {
  return action.source.kind === 'COVERAGE' ||
    (action.source.kind === 'GUIDANCE' && action.governance.safetyTier === 'REGULATED_COVERAGE');
}

/**
 * HomeAction carries only an overloaded source.entityId (sometimes a
 * journey id, sometimes a project id, sometimes already an inventory item
 * id) — not a clean typed subject for every source. Where the id is known
 * to already be a specific typed subject (PROJECT, and coverage-shaped
 * COVERAGE/GUIDANCE), use it directly. Everywhere else, fall back to a
 * PROPERTY subject and let obligationSlug (below) carry the entity-level
 * uniqueness instead — workKey omits the subject segment entirely for
 * PROPERTY subjects, so uniqueness must come from the slug in that case.
 * A later slice can tighten subject fidelity once loaders are extended to
 * carry a real subject id.
 */
function resolveSubject(action: HomeAction, propertyId: string): WorkSubject {
  if (action.source.kind === 'PROJECT') {
    // Home Operations Slice 4: a Project spawned from a guidance journey
    // (action.relatedJourneyId) is a handoff of the SAME obligation, not a
    // new one — resolve to the journey's own subject (see resolveObligation
    // below for the matching obligationSlug) so the two never mint separate
    // work items. Falls back to PROPERTY rather than re-deriving the
    // journey's own coverage-shaped subject (which would need the journey's
    // inventoryItemId/journeyTypeKey, not yet threaded through the Project
    // loader) — a documented, accepted simplification, same class of gap as
    // Slice 3's recommendation->task subject-fidelity note.
    if (action.relatedJourneyId) {
      return { type: 'PROPERTY', id: propertyId };
    }
    return { type: 'PROJECT', id: action.source.entityId };
  }
  if (isCoverageShaped(action)) {
    return { type: 'INVENTORY_ITEM', id: action.source.entityId };
  }
  return { type: 'PROPERTY', id: propertyId };
}

function resolveObligation(action: HomeAction): { obligationType: OperationalObligationType; obligationSlug: string } {
  if (action.source.kind === 'PROJECT') {
    // Same obligation as the originating GUIDANCE action below — see
    // resolveSubject's Slice 4 comment.
    if (action.relatedJourneyId) {
      return { obligationType: 'DECISION', obligationSlug: `guidance-${action.relatedJourneyId}` };
    }
    return { obligationType: 'PROJECT_EXECUTION', obligationSlug: 'execution' };
  }
  if (isCoverageShaped(action)) {
    return { obligationType: 'COVERAGE_ACTION', obligationSlug: 'coverage-gap' };
  }
  if (action.source.kind === 'GUIDANCE') {
    return { obligationType: 'DECISION', obligationSlug: `guidance-${action.source.entityId}` };
  }
  if (action.source.kind === 'MAINTENANCE') {
    return { obligationType: 'MAINTENANCE_TASK', obligationSlug: `maintenance-${action.source.entityId}` };
  }
  if (action.source.kind === 'INCIDENT') {
    return { obligationType: 'INCIDENT_RESPONSE', obligationSlug: `incident-${action.source.entityId}` };
  }
  if (action.source.kind === 'SALE_PREP') {
    // Sale Readiness Value-Maximization Checklist plan §4.8/§10 Phase 4: a
    // dedicated obligation type (not MAINTENANCE_TASK) so propertySaleCase
    // .service.ts's projectHomeActions can filter these back out of the
    // general Home Action pool before re-projecting it into Sale Case's own
    // checklist — otherwise the promoted work item would re-surface there
    // as a second, duplicate item wrapping the SaleReadinessItem that
    // spawned it.
    return { obligationType: 'SALE_PREP_TASK', obligationSlug: `sale-prep-${action.source.entityId}` };
  }
  // RECALL
  return { obligationType: 'INCIDENT_RESPONSE', obligationSlug: `recall-${action.source.entityId}` };
}

/**
 * Home Operations Item #14 (Gap 3): the workKey a Guidance journey's own
 * HomeAction resolves to via resolveSubject/resolveObligation above — but
 * computable from just {journeyId, journeyTypeKey, inventoryItemId}, for
 * callers (projectTracker.service.ts's project-lifecycle handoff) that only
 * have the journey record, not a live HomeAction. Two independent checks,
 * matching the two places the recommendation stage actually makes them:
 *   - KEY SHAPE: safetyTier === 'REGULATED_COVERAGE' (all 8 journey types
 *     that tier maps to), same broad check as isCoverageShaped above.
 *   - SUBJECT ID: only journeyTypeKey === 'coverage_gap_resolution' uses the
 *     real inventory item id as sourceEntityId (homeActionSourcePromotion
 *     .service.ts's narrower isCoverageJourney check) — every other
 *     REGULATED_COVERAGE type falls back to journey.id there, a fake
 *     "inventory item id." Reproduced here deliberately, bug included: this
 *     function's job is to agree with whatever key the recommendation stage
 *     actually produced for every journey type, not to correct that
 *     separate, pre-existing, out-of-scope inconsistency. Imports
 *     listGuidanceSafetyClassifications rather than re-hardcoding the
 *     REGULATED_COVERAGE journey-type list, so this stays in sync as that
 *     table evolves.
 */
export function resolveGuidanceJourneyWorkKey(params: {
  propertyId: string;
  journeyId: string;
  journeyTypeKey: string | null;
  inventoryItemId: string | null;
}): string {
  const isCoverageJourneyType = params.journeyTypeKey === 'coverage_gap_resolution';
  const sourceEntityId = isCoverageJourneyType && params.inventoryItemId
    ? params.inventoryItemId
    : params.journeyId;
  const safetyTier = params.journeyTypeKey
    ? listGuidanceSafetyClassifications()[params.journeyTypeKey]
    : undefined;

  if (safetyTier === 'REGULATED_COVERAGE') {
    return resolveWorkKey({
      propertyId: params.propertyId,
      subject: { type: 'INVENTORY_ITEM', id: sourceEntityId },
      obligationType: 'COVERAGE_ACTION',
      occurrence: { obligationSlug: 'coverage-gap' },
    });
  }
  return resolveWorkKey({
    propertyId: params.propertyId,
    subject: { type: 'PROPERTY', id: params.propertyId },
    obligationType: 'DECISION',
    occurrence: { obligationSlug: `guidance-${sourceEntityId}` },
  });
}

/**
 * Home Operations Item #14 (Gap 1): the recommendation-stage workKey a
 * checklist/seasonal MAINTENANCE HomeAction resolves to — same shape as
 * resolveObligation's MAINTENANCE branch above. Exposed so
 * PropertyMaintenanceTask.service.ts's conversion path can look up (and
 * reconcile onto) a CANDIDATE work item Slice 2 already resolved for the
 * pre-conversion recommendation, instead of silently forking a second one
 * at the task-stage key.
 */
export function resolveMaintenanceRecommendationWorkKey(propertyId: string, sourceEntityId: string): string {
  return resolveWorkKey({
    propertyId,
    subject: { type: 'PROPERTY', id: propertyId },
    obligationType: 'MAINTENANCE_TASK',
    occurrence: { obligationSlug: `maintenance-${sourceEntityId}` },
  });
}

/**
 * Home Operations Item #18 (§13.2 "Project scope coverage"): the workKey a
 * Project's own top-level work item resolves to via resolveSubject/
 * resolveObligation's PROJECT-with-no-relatedJourneyId branch above — but
 * computable from just {propertyId, projectId}, for
 * projectTracker.service.ts's completion/cancellation handoff, which only
 * has the project record, not a live HomeAction.
 */
export function resolveProjectExecutionWorkKey(propertyId: string, projectId: string): string {
  return resolveWorkKey({
    propertyId,
    subject: { type: 'PROJECT', id: projectId },
    obligationType: 'PROJECT_EXECUTION',
    occurrence: { obligationSlug: 'execution' },
  });
}

/**
 * Maps an already-built HomeAction into a ProposedWorkItem for the shared
 * identity resolver (resolveAndUpsertWorkItem). Deliberately works from the
 * normalized HomeAction rather than raw per-domain records (unlike the
 * WorkItemSourceAdapter<TSourceRecord> contract in domain/sourceAdapter.ts)
 * — the 14 existing loaders in homeActionSourcePromotion.service.ts already
 * compute title/reason/priority/safetyTier/confidence correctly and richly;
 * re-deriving that from raw records here would duplicate real logic rather
 * than reuse it. WorkItemSourceAdapter stays available for a future slice
 * that needs to resolve work items outside a live request.
 */
export function proposeWorkItemFromHomeAction(action: HomeAction, propertyId: string): ProposedWorkItem | null {
  if (!isWorkItemEligible(action)) return null;

  const subject = resolveSubject(action, propertyId);
  const { obligationType, obligationSlug } = resolveObligation(action);
  const sourceType = SOURCE_TYPE_BY_KIND[action.source.kind];
  if (!sourceType) return null;

  return {
    propertyId,
    subject,
    obligationType,
    occurrence: { obligationSlug },
    title: action.signal,
    homeownerReason: action.whyItMatters,
    expectedOutcome: action.expectedOutcome,
    priority: action.priority,
    safetyTier: action.governance.safetyTier,
    dueWindowStart: action.timing.windowStart ? new Date(action.timing.windowStart) : null,
    dueAt: action.timing.dueAt ? new Date(action.timing.dueAt) : null,
    dueWindowEnd: action.timing.windowEnd ? new Date(action.timing.windowEnd) : null,
    confidence: action.confidence.score,
    missingContext: action.confidence.missing,
    source: {
      sourceType,
      sourceEntityId: action.source.entityId,
      sourceVersion: action.source.version,
      sourceRole: 'TRIGGER',
    },
  };
}
