import type { HomeAction } from '../../../productFramework';
import type { ProposedWorkItem } from '../domain/sourceAdapter';
import type { WorkSubject } from '../domain/workKey';
import type { OperationalObligationType, OperationalWorkSourceType } from '@prisma/client';

/**
 * Home Operations Slice 2: which HomeAction source kinds represent genuine
 * "work" (an obligation Home Operations should track through a lifecycle)
 * versus a pure advisory recommendation. This mirrors Slice 0's own finding
 * — PERSONALIZATION/SYSTEM/SAVINGS_BENEFITS sources have no authoritative
 * domain completion adapter behind them (see homeActions.service.ts's
 * SOURCE_KINDS_WITHOUT_COMPLETION_ADAPTER) and were downgraded to
 * ACKNOWLEDGE-only for that reason. They stay outside the work-item
 * backlog; Inspection Finding stays out too since it isn't promoted into
 * HomeAction at all yet (Slice 5).
 */
export const WORK_ITEM_ELIGIBLE_SOURCE_KINDS: ReadonlySet<HomeAction['source']['kind']> = new Set([
  'MAINTENANCE',
  'GUIDANCE',
  'PROJECT',
  'INCIDENT',
  'RECALL',
  'COVERAGE',
]);

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
    return { type: 'PROJECT', id: action.source.entityId };
  }
  if (isCoverageShaped(action)) {
    return { type: 'INVENTORY_ITEM', id: action.source.entityId };
  }
  return { type: 'PROPERTY', id: propertyId };
}

function resolveObligation(action: HomeAction): { obligationType: OperationalObligationType; obligationSlug: string } {
  if (action.source.kind === 'PROJECT') {
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
  // RECALL
  return { obligationType: 'INCIDENT_RESPONSE', obligationSlug: `recall-${action.source.entityId}` };
}

const SOURCE_TYPE_BY_KIND: Partial<Record<HomeAction['source']['kind'], OperationalWorkSourceType>> = {
  MAINTENANCE: 'MAINTENANCE',
  GUIDANCE: 'GUIDANCE',
  PROJECT: 'PROJECT',
  INCIDENT: 'INCIDENT',
  RECALL: 'RECALL',
  COVERAGE: 'COVERAGE',
};

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
