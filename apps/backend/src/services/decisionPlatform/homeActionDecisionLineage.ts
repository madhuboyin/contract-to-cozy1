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
  // pretend lineage is available. decisionDefinitionId/primaryEntityId are
  // nullable here specifically (only here): Phase 3 review finding 1 —
  // a DECISION_REQUIRED action whose lineageId matches no registered
  // prefix at all (resolveDecisionFamilyRef returns null, so there is no
  // ref to build a real decisionDefinitionId/primaryEntityId from) is a
  // MORE severe instance of "lineage unavailable," not a different case,
  // and must still produce a truthy HomeActionDecisionLineage so the
  // frontend never falls through to its ungated plain-link render path.
  | { status: 'UNAVAILABLE'; decisionDefinitionId: DecisionDefinitionId | null; primaryEntityId: string | null; reason: string };

/**
 * Phase 3 review finding 1: the single place every "this DECISION_REQUIRED
 * action has no usable lineage" caller constructs the UNAVAILABLE object —
 * whether or not a ref (decisionDefinitionId/primaryEntityId) could even
 * be resolved. A caller that instead left decisionLineage as null in this
 * situation is exactly the bug that let a blocked material action fall
 * through to the frontend's ungated plain-link render path.
 */
export function unavailableDecisionLineage(
  ref: { decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string } | null,
  reason: string,
): HomeActionDecisionLineage {
  return {
    status: 'UNAVAILABLE',
    decisionDefinitionId: ref?.decisionDefinitionId ?? null,
    primaryEntityId: ref?.primaryEntityId ?? null,
    reason,
  };
}

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
 * OperationalWorkSource is the durable path back to each decision primary
 * entity: GUIDANCE/ReplaceRepairAnalysis resolves the HVAC inventory item,
 * while COVERAGE/CoverageReview resolves its current primary questionKey.
 * Both source types also contain non-decision obligations, so concrete
 * record resolution distinguishes required lineage from a legitimate no-op.
 */
export class DecisionLineageRequiredForAcceptanceError extends APIError {
  constructor(message: string) {
    super(message, 409, 'DECISION_LINEAGE_REQUIRED');
    this.name = 'DecisionLineageRequiredForAcceptanceError';
  }
}

type WorkItemDecisionFamilyRef = HomeActionDecisionFamilyRef & { sourceLabel: string };

export const WORK_ITEM_DECISION_LINEAGE_SOURCE_TYPES = new Set(['GUIDANCE', 'COVERAGE'] as const);

/** Resolve every decision-required source family that can currently produce a work item. */
export async function resolveWorkItemDecisionFamilyRefs(
  propertyId: string,
  workItemId: string,
  db: WorkItemDb,
): Promise<WorkItemDecisionFamilyRef[]> {
  const sources = await db.operationalWorkSource.findMany({
    where: {
      workItemId,
      sourceType: { in: [...WORK_ITEM_DECISION_LINEAGE_SOURCE_TYPES] },
    },
    select: { sourceType: true, sourceEntityId: true },
  });
  const refs: WorkItemDecisionFamilyRef[] = [];

  for (const source of sources) {
    if (source.sourceType === 'GUIDANCE') {
      const analysis = await db.replaceRepairAnalysis.findFirst({
        where: { id: source.sourceEntityId, propertyId },
        select: { inventoryItemId: true },
      });
      if (analysis) {
        refs.push({
          decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
          primaryEntityId: analysis.inventoryItemId,
          sourceLabel: 'repair/replace',
        });
      }
      continue;
    }

    const coverageReview = await db.coverageReview.findFirst({
      where: { id: source.sourceEntityId, propertyId },
      select: {
        questions: {
          where: {
            isPrimary: true,
            status: 'OPEN',
            questionType: 'EVIDENCE_BASED',
            priority: 'HIGH',
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { questionKey: true },
        },
      },
    });
    // COVERAGE also backs renewal reminders; only CoverageReview sources
    // represent the decision-required coverage-question producer.
    if (!coverageReview) continue;
    const questionKey = coverageReview.questions[0]?.questionKey;
    if (!questionKey) {
      throw new DecisionLineageRequiredForAcceptanceError(
        'This coverage obligation no longer has a current primary question and cannot be accepted until the coverage review is refreshed.',
      );
    }
    refs.push({
      decisionDefinitionId: 'COVERAGE_QUESTION',
      primaryEntityId: questionKey,
      sourceLabel: 'coverage',
    });
  }
  return refs;
}

export async function assertDecisionLineageSatisfiedForAcceptance(
  propertyId: string,
  workItemId: string,
  db: WorkItemDb,
): Promise<void> {
  const refs = await resolveWorkItemDecisionFamilyRefs(propertyId, workItemId, db);
  for (const ref of refs) {
    const lineage = await resolveHomeActionDecisionLineage(propertyId, ref);
    if (lineage.status !== 'LINKED' || !lineage.thread.currentRecommendationSnapshotId) {
      const status = lineage.status === 'LINKED' ? 'MISSING_CURRENT_SNAPSHOT' : lineage.status;
      throw new DecisionLineageRequiredForAcceptanceError(
        `This ${ref.sourceLabel} decision needs a current recommendation before the work can be accepted (decision lineage status: ${status}).`,
      );
    }
  }
}

/**
 * Home Intelligence Functional Completeness FRD Phase 3 review finding 2:
 * assertDecisionLineageSatisfiedForAcceptance above guards the one
 * OperationalWorkItem CANDIDATE -> ACCEPTED chokepoint for every producer
 * that is both workKeyEligible and DECISION_REQUIRED (currently HVAC
 * repair/replace and coverage questions). The other domains do not reach
 * it (refinance, capital-timeline, savings-benefit-match, and sell-hold-rent
 * are not workKeyEligible; ownership-cost-change's COMPLETE routes straight to
 * ownershipCostDecisionService.record via an id-prefix carve-out in
 * executeHomeActionCommand, never touching transitionWorkItem at all).
 *
 * This is the domain-agnostic sibling for the Home Action command surface
 * itself: COMPLETE/ALREADY_DONE are the two commands that represent
 * "the homeowner is committing to/finishing this recommendation", and
 * every domain's decision lineage is already resolved generically by
 * linkDecisionLineage (via the adapter registry) onto action.decisionLineage
 * by the time executeHomeActionCommand loads the action from the feed — so
 * this needs no DB access and no per-domain traversal, unlike the guard
 * above. Called once from executeHomeActionCommand, upstream of every
 * command-specific dispatch (OperationalWorkItem-backed or not).
 */
export function assertHomeActionDecisionLineageSatisfiedForCommitment(
  action: { decisionLineage: HomeActionDecisionLineage | null },
): void {
  if (!action.decisionLineage) return;
  if (action.decisionLineage.status !== 'LINKED') {
    throw new DecisionLineageRequiredForAcceptanceError(
      `This recommendation needs a current, tracked decision before it can be completed (decision lineage status: ${action.decisionLineage.status}).`,
    );
  }
}
