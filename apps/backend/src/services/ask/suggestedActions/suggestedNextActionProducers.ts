// Plan §5.1: producers nominate candidates; they never decide visibility. The registry is a static, ordered list so the
// documentation-parity script (§13) can read it. Handlers attach typed candidates to their result and the one producer below passes them
// to the policy. Raw handler suggestions may still exist while migration is in progress, but the finalizer strips them from every
// newly governed result; only historical results without the governance marker retain frontend compatibility.
//
// A producer failure is isolated by the finalizer (its nominations are dropped and counted); it can never crash startup or
// invalidate an otherwise safe answer, so producers may throw.
import type { AskOperationId, AskOperationResult } from '../askOperationRegistry';
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';
import {
  homeBasicsStarters, hiringGuideStarters, propertySummaryStarters, seasonalHomeCareStarters,
  STARTER_HIRING_GUIDE_PRODUCER_ID, STARTER_HOME_BASICS_PRODUCER_ID, STARTER_PROPERTY_SUMMARY_PRODUCER_ID, STARTER_SEASONAL_PRODUCER_ID,
} from './starterCandidates';
import { ACTIONABLE_PROFILE_PRODUCER_ID, actionableProfileCandidates } from './actionableProfileCandidates';
import { loadActionableProfileState } from './actionableCompletenessLoader';
import { SKILL_HANDOFF_PRODUCER_ID, skillHandoffCandidates } from './skillHandoffCandidates';
import { URGENT_WORK_PRODUCER_ID, loadUrgentHomeActionState, urgentWorkCandidates } from './urgentWorkCandidates';
import { HOME_OPPORTUNITY_PRODUCER_ID, homeOpportunityCandidates, loadHomeOpportunityState } from './homeOpportunityCandidates';
import { ACTIVE_PLAN_PRODUCER_ID, activePlanCandidates, loadActivePlanState } from './activePlanCandidates';
import { CAPABILITY_RECOMMENDATION_PRODUCER_ID, capabilityRecommendationCandidates } from './capabilityRecommendationCandidates';
import {
  OPERATION_SPECIFIC_CONTINUATION_PRODUCER_ID,
  operationSpecificContinuationCandidates,
  recipeTargetsDecisionThread,
} from './operationSpecificContinuationCandidates';
import { loadOperationSpecificContinuationState } from './operationSpecificContinuationState';
import { OPERATION_SPECIFIC_CONTINUATION_RECIPES } from './operationSpecificContinuationRecipes';

export interface ProducerContext {
  result: AskOperationResult;
  executionId: string;
  sourceOperationId: string | null;
  propertyId: string | null;
  message: string;
  userId: string;
  loadActionableProfileState: typeof loadActionableProfileState;
  loadUrgentHomeActionState: typeof loadUrgentHomeActionState;
  loadHomeOpportunityState: typeof loadHomeOpportunityState;
  loadActivePlanState: typeof loadActivePlanState;
  loadOperationSpecificContinuationState: typeof loadOperationSpecificContinuationState;
}

export interface SuggestedNextActionProducer {
  /** Registered, stable id; also the bounded metrics label. */
  id: string;
  source: SuggestedNextAction['provenance']['source'];
  /** Nonessential producers are the first dropped when the pipeline budget is exceeded. */
  essential: boolean;
  nominate(context: ProducerContext): readonly unknown[] | Promise<readonly unknown[]>;
}

/** Handler-attached typed candidates (the migration path for every Phase 3 domain). */
export const resultCandidatesProducer: SuggestedNextActionProducer = {
  id: 'operation-result.candidates',
  source: 'OPERATION_RESULT',
  essential: true,
  nominate: ({ result }) => result.suggestedNextActionCandidates ?? [],
};

/** Registry-authored continuations for settled operations that do not own handler-attached candidates yet. */
export const operationSpecificContinuationProducer: SuggestedNextActionProducer = {
  id: OPERATION_SPECIFIC_CONTINUATION_PRODUCER_ID,
  source: 'OPERATION_RESULT',
  essential: true,
  nominate: async ({ sourceOperationId, propertyId, loadOperationSpecificContinuationState: loadState, loadActivePlanState: loadPlan }) => {
    if (!sourceOperationId || !propertyId) return [];
    // HOME_ACTIONS is a ranked feed of real work. Its related row must not imply that empty
    // maintenance, inspection, or recall collections contain records. Other operation recipes
    // retain their established continuation behavior; several are intentional domain-navigation
    // receipts rather than claims that a collection is non-empty.
    const recipes = OPERATION_SPECIFIC_CONTINUATION_RECIPES[sourceOperationId as AskOperationId] ?? [];
    const needsRecordState = sourceOperationId === 'HOME_ACTIONS' && recipes.length > 0;
    const needsForecastState = recipes.some((entry) => entry.operationId === 'MAINTENANCE_FORECAST');
    let state: Awaited<ReturnType<typeof loadState>> | undefined;
    if (needsRecordState) {
      state = await loadState(propertyId, { records: true, forecast: needsForecastState });
    } else if (needsForecastState) {
      // Forecast readiness is an optimisation: if the read fails the recipe stays (the destination's own recovery chip covers it).
      state = await loadState(propertyId, { records: false, forecast: true }).catch(() => undefined);
    }
    // Thread-bound HVAC destinations are nominated only when exactly one HVAC decision is active. With several, choosing by recency
    // would guess which system the homeowner means, so the recipe is dropped instead (Decision Thread contract).
    const hvacThreads = recipes.some((entry) => recipeTargetsDecisionThread(entry.operationId))
      ? (await loadPlan({ propertyId })).hvacThreads ?? []
      : [];
    const hvacThread = hvacThreads.length === 1 ? hvacThreads[0] : null;
    return operationSpecificContinuationCandidates(sourceOperationId, propertyId, state, hvacThread);
  },
};

/**
 * The curated starters (exact-four, inventory D-O4): one registered producer per starter source, so each has its own server-owned grant
 * (CURATED_STARTER only). They are ESSENTIAL (static and synchronous, so they preserve exact-four when optional enrichment has used the
 * budget and are never dropped for it). Each nominates only for a property-scoped
 * turn and reads nothing: the candidates are static, and the shared finalizer's eligibility, lifecycle and policy decide visibility.
 */
const starterProducer = (id: string, nominate: (propertyId: string) => readonly unknown[]): SuggestedNextActionProducer => ({
  // Static and synchronous: these preserve exact-four when optional enrichment has consumed the budget without adding latency.
  id, source: 'CAPABILITY_RECOMMENDATION', essential: true,
  nominate: ({ propertyId }) => (propertyId ? nominate(propertyId) : []),
});
export const starterProducers: readonly SuggestedNextActionProducer[] = [
  starterProducer(STARTER_PROPERTY_SUMMARY_PRODUCER_ID, propertySummaryStarters),
  starterProducer(STARTER_SEASONAL_PRODUCER_ID, seasonalHomeCareStarters),
  starterProducer(STARTER_HOME_BASICS_PRODUCER_ID, homeBasicsStarters),
  starterProducer(STARTER_HIRING_GUIDE_PRODUCER_ID, hiringGuideStarters),
];

export const actionableProfileProducer: SuggestedNextActionProducer = {
  id: ACTIONABLE_PROFILE_PRODUCER_ID,
  source: 'MISSING_DETAIL',
  essential: false,
  nominate: ({ userId, propertyId, loadActionableProfileState: loadState }) => propertyId ? actionableProfileCandidates({ userId, propertyId }, loadState) : [],
};

export const skillHandoffProducer: SuggestedNextActionProducer = {
  id: SKILL_HANDOFF_PRODUCER_ID,
  source: 'SKILL_HANDOFF',
  essential: true,
  nominate: ({ result, sourceOperationId, propertyId }) => skillHandoffCandidates({ result, sourceOperationId, propertyId }),
};

export const urgentWorkProducer: SuggestedNextActionProducer = {
  id: URGENT_WORK_PRODUCER_ID,
  source: 'PLATFORM_STATE',
  essential: false,
  nominate: ({ userId, propertyId, loadUrgentHomeActionState: loadState }) => propertyId
    ? urgentWorkCandidates({ userId, propertyId }, loadState)
    : [],
};

export const homeOpportunityProducer: SuggestedNextActionProducer = {
  id: HOME_OPPORTUNITY_PRODUCER_ID,
  source: 'PLATFORM_STATE',
  essential: false,
  nominate: ({ userId, propertyId, loadHomeOpportunityState: loadState }) => propertyId
    ? homeOpportunityCandidates({ userId, propertyId }, loadState)
    : [],
};

export const activePlanProducer: SuggestedNextActionProducer = {
  id: ACTIVE_PLAN_PRODUCER_ID,
  source: 'ACTIVE_GOAL',
  essential: false,
  nominate: ({ propertyId, loadActivePlanState: loadState }) => propertyId
    ? activePlanCandidates({ propertyId }, loadState)
    : [],
};

export const capabilityRecommendationProducer: SuggestedNextActionProducer = {
  id: CAPABILITY_RECOMMENDATION_PRODUCER_ID,
  source: 'CAPABILITY_RECOMMENDATION',
  essential: false,
  nominate: ({ result, propertyId }) => capabilityRecommendationCandidates(result, propertyId),
};

export const SUGGESTED_NEXT_ACTION_PRODUCERS: readonly SuggestedNextActionProducer[] = [
  // Static starters are deliberately nominated before database-backed enrichment. They are essential (synchronous, no reads), so a
  // slow optional read can neither consume the budget before the exact-four fallback inventory has been collected nor drop them.
  resultCandidatesProducer, operationSpecificContinuationProducer, skillHandoffProducer, ...starterProducers,
  urgentWorkProducer, activePlanProducer, capabilityRecommendationProducer, actionableProfileProducer, homeOpportunityProducer,
];
