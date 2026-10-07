// Plan §5.1: producers nominate candidates; they never decide visibility. The registry is a static, ordered list so the
// documentation-parity script (§13) can read it. Handlers attach typed candidates to their result and the one producer below passes them
// to the policy. Raw handler suggestions may still exist while migration is in progress, but the finalizer strips them from every
// newly governed result; only historical results without the governance marker retain frontend compatibility.
//
// A producer failure is isolated by the finalizer (its nominations are dropped and counted); it can never crash startup or
// invalidate an otherwise safe answer, so producers may throw.
import type { AskOperationResult } from '../askOperationRegistry';
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

/**
 * The curated starters (exact-four, inventory D-O4): one registered producer per starter source, so each has its own server-owned grant
 * (CURATED_STARTER only). They are NONESSENTIAL: the first dropped when the pipeline budget is exceeded. Each nominates only for a property-scoped
 * turn and reads nothing: the candidates are static, and the shared finalizer's eligibility, lifecycle and policy decide visibility.
 */
const starterProducer = (id: string, nominate: (propertyId: string) => readonly unknown[]): SuggestedNextActionProducer => ({
  id, source: 'CAPABILITY_RECOMMENDATION', essential: false,
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
  resultCandidatesProducer, skillHandoffProducer, urgentWorkProducer, activePlanProducer, capabilityRecommendationProducer, actionableProfileProducer, homeOpportunityProducer, ...starterProducers,
];
