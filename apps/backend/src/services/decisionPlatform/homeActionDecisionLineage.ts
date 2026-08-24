// Home Intelligence Functional Completeness FRD Phase 3A (HI-DEC-002,
// work items 2-6) — resolves a material Home Action to its decision
// family and Decision Thread lineage through the adapter registry, and
// creates/resumes that thread before a homeowner proceeds to compare or
// commit.
//
// The only Home Action producer that maps to a registered decision family
// today is loadRepairReplaceDecisionActions
// (homeActionSourcePromotion.service.ts), whose lineageId is
// `repair-replace:${inventoryItemId}` (see that function). Extend
// resolveDecisionFamilyRef here, not in homeActions.service.ts itself, when
// a second decision-family-eligible producer is registered — this keeps
// every id-prefix-to-decision-family mapping in one place, the same way
// OWNERSHIP_COST_CHANGE_ID_PREFIX/ACTIVATION_ID_PREFIX are centralized in
// homeActionProducerOwnership.ts for command routing.

import { logger } from '../../lib/logger';
import { APIError } from '../../middleware/error.middleware';
import type { WorkItemDb } from '../../modules/homeOperations/infrastructure/workItemRepository';
import type { DecisionFamilyThreadLineage, HomeActionOriginRef } from './decisionFamilyAdapter';
import { DecisionFamilyAmbiguousThreadError } from './decisionFamilyAdapter';
import { getDecisionFamilyAdapter } from './decisionFamilyAdapterRegistry';
import type { DecisionDefinitionId } from './decisionDefinitionRegistry';
import type { DecisionLineagePolicy } from '../intelligence/homeActionProducerOwnership.contract';
import { OPERATIONAL_WORK_ID_PREFIX, OWNERSHIP_COST_CHANGE_ID_PREFIX } from '../intelligence/homeActionProducerOwnership';

export type { HomeActionOriginRef } from './decisionFamilyAdapter';
export type { DecisionLineagePolicy } from '../intelligence/homeActionProducerOwnership.contract';

const REPAIR_REPLACE_ID_PREFIX = 'repair-replace:';
// Home Intelligence Functional Completeness FRD Phase 3 review finding 4,
// delivery step 6 — one prefix per new decision-family adapter
// (domainSnapshotAdapters.ts), matching each producer's own lineageId
// construction in homeActionSourcePromotion.service.ts exactly.
const REFINANCE_OPPORTUNITY_ID_PREFIX = 'refinance-opportunity:';
const HOME_CAPITAL_TIMELINE_WINDOW_ID_PREFIX = 'home-capital-timeline-window:';
const SAVINGS_BENEFIT_MATCH_ID_PREFIX = 'savings-benefit-match:';
// Resume path for an already-started Savings & Benefits action — execution
// continuity, not a fresh decision (same reasoning as
// OPERATIONAL_WORK_ID_PREFIX below), even though its governance is
// MATERIAL_FINANCIAL. No decision-family adapter for this prefix.
const SAVINGS_BENEFIT_ACTION_ID_PREFIX = 'savings-benefit-action:';
const COVERAGE_QUESTION_ID_PREFIX = 'coverage-review:';
const SELL_HOLD_RENT_ID_PREFIX = 'sell-hold-rent:';
// Phase 3 review finding 4 delivery step 6 reclassification: both are
// MATERIAL_FINANCIAL-governed but not verdict-bearing recommendations — a
// renewal reminder against a static choice, and a workflow/case tracker
// for an appeal the homeowner already decided to pursue. Neither has (or
// needs) a decision-family adapter; see their homeActionProducerOwnership
// .ts registry notes for the full reasoning.
const COVERAGE_RENEWAL_ID_PREFIX = 'coverage-renewal:';
const PROPERTY_TAX_APPEAL_CASE_ID_PREFIX = 'property-tax-appeal-case:';

export interface HomeActionDecisionFamilyRef {
  decisionDefinitionId: DecisionDefinitionId;
  primaryEntityId: string;
}

const PREFIX_TO_DECISION_DEFINITION: Array<{ prefix: string; decisionDefinitionId: DecisionDefinitionId }> = [
  { prefix: REPAIR_REPLACE_ID_PREFIX, decisionDefinitionId: 'HVAC_REPAIR_REPLACE' },
  { prefix: REFINANCE_OPPORTUNITY_ID_PREFIX, decisionDefinitionId: 'REFINANCE_OPPORTUNITY' },
  { prefix: HOME_CAPITAL_TIMELINE_WINDOW_ID_PREFIX, decisionDefinitionId: 'HOME_CAPITAL_TIMELINE_WINDOW' },
  { prefix: OWNERSHIP_COST_CHANGE_ID_PREFIX, decisionDefinitionId: 'OWNERSHIP_COST_CHANGE' },
  { prefix: SAVINGS_BENEFIT_MATCH_ID_PREFIX, decisionDefinitionId: 'SAVINGS_BENEFIT_MATCH' },
  { prefix: COVERAGE_QUESTION_ID_PREFIX, decisionDefinitionId: 'COVERAGE_QUESTION' },
  { prefix: SELL_HOLD_RENT_ID_PREFIX, decisionDefinitionId: 'SELL_HOLD_RENT' },
];

/**
 * Returns null for the overwhelming majority of Home Actions — those with
 * no registered decision family at all. That is not the fail-closed
 * "UNAVAILABLE" case below; it means this action is simply out of scope for
 * Decision Thread lineage.
 */
export function resolveDecisionFamilyRef(action: { lineageId: string }): HomeActionDecisionFamilyRef | null {
  for (const { prefix, decisionDefinitionId } of PREFIX_TO_DECISION_DEFINITION) {
    if (!action.lineageId.startsWith(prefix)) continue;
    const primaryEntityId = action.lineageId.slice(prefix.length);
    if (!primaryEntityId) return null;
    return { decisionDefinitionId, primaryEntityId };
  }
  return null;
}

export type HomeActionDecisionLineage =
  | { status: 'LINKED'; decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string; thread: DecisionFamilyThreadLineage }
  | { status: 'NOT_STARTED'; decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string }
  | { status: 'AMBIGUOUS'; decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string }
  // The primary entity does not qualify for this decision family (e.g. a
  // non-HVAC appliance under the HVAC_REPAIR_REPLACE family) — not a
  // registry gap, just out of scope for this specific item.
  | { status: 'NOT_APPLICABLE'; decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string }
  // HI-DEC-002 work item 6: no registered decision-family adapter exists
  // for this action's decisionDefinitionId — fail closed rather than
  // pretend lineage is available.
  | { status: 'UNAVAILABLE'; decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string; reason: string };

/** Read-only. Never creates a thread — safe to call while rendering the Home feed. */
export async function resolveHomeActionDecisionLineage(
  propertyId: string,
  ref: HomeActionDecisionFamilyRef,
): Promise<HomeActionDecisionLineage> {
  const adapter = getDecisionFamilyAdapter(ref.decisionDefinitionId);
  if (!adapter) {
    return { status: 'UNAVAILABLE', ...ref, reason: `No decision-family adapter is registered for ${ref.decisionDefinitionId}.` };
  }
  const eligible = await adapter.isEligiblePrimaryEntity(propertyId, ref.primaryEntityId);
  if (!eligible) return { status: 'NOT_APPLICABLE', ...ref };
  const selection = await adapter.selectThread(propertyId, ref.primaryEntityId);
  if (selection.kind === 'NONE') return { status: 'NOT_STARTED', ...ref };
  if (selection.kind === 'AMBIGUOUS') return { status: 'AMBIGUOUS', ...ref };
  return { status: 'LINKED', ...ref, thread: selection.thread };
}

/**
 * HI-DEC-002: "Starting a material recommendation shall create or resume a
 * Decision Thread and persist an immutable Recommendation Snapshot before
 * external commitment." Called when a homeowner opens a decision-family-
 * eligible Home Action (recordHomeActionOpened) — genuine engagement, not
 * merely a Home feed render, so listing Home never writes.
 */
export async function startOrResumeHomeActionDecisionThread(input: {
  propertyId: string;
  userId: string;
  ref: HomeActionDecisionFamilyRef;
  askExecutionId?: string;
  homeActionOrigin?: HomeActionOriginRef;
}): Promise<HomeActionDecisionLineage> {
  const { propertyId, userId, ref, askExecutionId, homeActionOrigin } = input;
  const adapter = getDecisionFamilyAdapter(ref.decisionDefinitionId);
  if (!adapter) {
    return { status: 'UNAVAILABLE', ...ref, reason: `No decision-family adapter is registered for ${ref.decisionDefinitionId}.` };
  }
  const eligible = await adapter.isEligiblePrimaryEntity(propertyId, ref.primaryEntityId);
  if (!eligible) return { status: 'NOT_APPLICABLE', ...ref };
  try {
    const thread = await adapter.createOrResumeThread({ propertyId, userId, primaryEntityId: ref.primaryEntityId, askExecutionId, homeActionOrigin });
    return { status: 'LINKED', ...ref, thread };
  } catch (error) {
    if (error instanceof DecisionFamilyAmbiguousThreadError) return { status: 'AMBIGUOUS', ...ref };
    logger.warn({ err: error, propertyId, ref }, 'Decision thread create-or-resume failed; Home Action opened without decision lineage this request');
    return { status: 'UNAVAILABLE', ...ref, reason: 'Unable to start or resume the decision at this time.' };
  }
}

// Home Intelligence Functional Completeness FRD Phase 3 review finding 4.
// Producers whose instances can carry more than one safety tier declare
// decisionLineagePolicy: VARIES_BY_INSTANCE in homeActionProducerOwnership
// .ts (a reviewed, audited classification a completeness test enforces);
// this is the actual per-action runtime rule every action is ultimately
// evaluated against, VARIES_BY_INSTANCE producer or not. safetyTier alone
// is not the signal: an emergency should never wait on a Decision Thread,
// and completing already-accepted work is execution continuity, not fresh
// decision creation, even when material.
export function resolveActionDecisionLineagePolicy(
  action: { lineageId: string; governance: { safetyTier: string } },
): DecisionLineagePolicy {
  if (
    action.lineageId.startsWith(OPERATIONAL_WORK_ID_PREFIX) ||
    action.lineageId.startsWith(SAVINGS_BENEFIT_ACTION_ID_PREFIX) ||
    action.lineageId.startsWith(COVERAGE_RENEWAL_ID_PREFIX) ||
    action.lineageId.startsWith(PROPERTY_TAX_APPEAL_CASE_ID_PREFIX)
  ) {
    return { kind: 'NOT_REQUIRED' };
  }
  const tier = action.governance.safetyTier;
  if (tier !== 'MATERIAL_FINANCIAL' && tier !== 'REGULATED_COVERAGE') {
    return { kind: 'NOT_REQUIRED' };
  }
  const ref = resolveDecisionFamilyRef(action);
  return { kind: 'DECISION_REQUIRED', decisionDefinitionId: ref?.decisionDefinitionId ?? null };
}

/**
 * Home Intelligence Functional Completeness FRD Phase 3 review finding 4,
 * delivery step 5: "Acceptance, booking, project creation, and other
 * commitment APIs must independently reject the request without valid
 * thread/snapshot lineage. Do not rely on the UI alone for fail-closed
 * enforcement." CANDIDATE -> ACCEPTED (acceptanceState PROPOSED -> ACCEPTED,
 * see domain/transitions.ts) is this codebase's own definition of external
 * commitment, and every commitment path — explicit user acceptance, booking
 * creation, project creation — funnels through transitionWorkItem.usecase.ts
 * at that one edge, so it is the single chokepoint this guards.
 *
 * An OperationalWorkItem carries no direct inventoryItemId for a
 * GUIDANCE-sourced obligation — resolveSubject in homeActionWorkItem
 * .adapter.ts falls through to a PROPERTY subject for everything except
 * coverage-shaped GUIDANCE actions — so the only reliable path back to the
 * primary entity is the work item's own OperationalWorkSource
 * (sourceType: GUIDANCE).sourceEntityId, which for
 * loadRepairReplaceDecisionActions (homeActionSourcePromotion.service.ts)
 * is the originating ReplaceRepairAnalysis id. A work item with no such
 * source, or whose source doesn't resolve to a ReplaceRepairAnalysis, is
 * not a repair/replace obligation and this is a no-op — the overwhelming
 * majority of work items never reach the lookup below at all.
 */
export class DecisionLineageRequiredForAcceptanceError extends APIError {
  constructor(message: string) {
    super(message, 409, 'DECISION_LINEAGE_REQUIRED');
    this.name = 'DecisionLineageRequiredForAcceptanceError';
  }
}

export async function assertDecisionLineageSatisfiedForAcceptance(
  propertyId: string,
  workItemId: string,
  db: WorkItemDb,
): Promise<void> {
  const sources = await db.operationalWorkSource.findMany({
    where: { workItemId, sourceType: 'GUIDANCE' },
    select: { sourceEntityId: true },
  });
  if (!sources.length) return;

  for (const source of sources) {
    const analysis = await db.replaceRepairAnalysis.findUnique({
      where: { id: source.sourceEntityId },
      select: { inventoryItemId: true },
    });
    if (!analysis) continue;

    const lineage = await resolveHomeActionDecisionLineage(propertyId, {
      decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
      primaryEntityId: analysis.inventoryItemId,
    });
    if (lineage.status !== 'LINKED') {
      throw new DecisionLineageRequiredForAcceptanceError(
        `This repair/replace decision needs a current recommendation before the work can be accepted (decision lineage status: ${lineage.status}).`,
      );
    }
    return;
  }
}
