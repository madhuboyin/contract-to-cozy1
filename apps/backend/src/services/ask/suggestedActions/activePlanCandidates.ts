import { sellHoldRentDecisionFamilyAdapter } from '../../decisionPlatform/domainSnapshotAdapters';
import { listActiveDecisionThreadsForProperty } from '../../decisionPlatform/decisionThreadService';
import { guidanceJourneyService } from '../../guidanceEngine/guidanceJourney.service';
import {
  DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, SuggestedNextActionCandidateSchema,
  type SuggestedNextActionCandidate,
} from './suggestedNextActionCandidate';

export const ACTIVE_PLAN_PRODUCER_ID = 'active-plan.decision-thread';

export interface ActivePlanState {
  sellHoldRentActive: boolean;
  hvacThreads: Array<{ id: string; contextVersion: string }>;
  guidanceJourneys: Array<{ id: string; contextVersion: string }>;
}

export async function loadActivePlanState(input: { propertyId: string }): Promise<ActivePlanState> {
  const [selection, threads, journeys] = await Promise.all([
    sellHoldRentDecisionFamilyAdapter.selectThread(input.propertyId, input.propertyId),
    listActiveDecisionThreadsForProperty(input.propertyId, 10),
    guidanceJourneyService.listActiveJourneysForProperty(input.propertyId),
  ]);
  return {
    sellHoldRentActive: selection.kind === 'UNIQUE',
    hvacThreads: threads.filter((thread) => thread.decisionDefinitionId === 'HVAC_REPAIR_REPLACE').map((thread) => ({ id: thread.id, contextVersion: thread.updatedAt.toISOString() })),
    guidanceJourneys: journeys.slice(0, 10).map((journey: any) => ({ id: journey.id, contextVersion: journey.updatedAt.toISOString() })),
  };
}

export async function activePlanCandidates(
  input: { propertyId: string },
  loadState: typeof loadActivePlanState = loadActivePlanState,
): Promise<SuggestedNextActionCandidate[]> {
  const state = await loadState(input);
  const candidates: unknown[] = [];
  if (state.sellHoldRentActive) candidates.push({
    source: 'ACTIVE_GOAL', sourceOperationId: null,
    label: 'Continue your sell, hold, or rent plan', message: 'Show the latest on my sell, hold, or rent plan.',
    operationId: 'SELL_HOLD_RENT_ANALYSIS', interactionType: 'CONVERSATION_CONTINUE', outcomeKey: 'CONTINUE_SELL_HOLD_RENT_PLAN',
    entityContext: { propertyId: input.propertyId, entityType: null, entityId: null, contextVersion: null },
    tier: 'CONTINUE', slotClass: 'CONTINUE_WORK', requiredFacts: [], reasonCodes: ['ACTIVE_DECISION_THREAD'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, activeGoalMatch: true, materiality: 2, sourceConfidence: 1 },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
  });
  for (const thread of state.hvacThreads ?? []) candidates.push({
    source: 'ACTIVE_GOAL', sourceOperationId: null, label: 'Continue an active HVAC decision', message: 'Continue this HVAC decision.',
    operationId: 'HVAC_DECISION_CONTINUE', interactionType: 'CONVERSATION_CONTINUE', outcomeKey: 'CONTINUE_ACTIVE_HVAC_DECISION',
    entityContext: { propertyId: input.propertyId, entityType: 'DECISION_THREAD', entityId: thread.id, contextVersion: thread.contextVersion },
    tier: 'CONTINUE', slotClass: 'CONTINUE_WORK', requiredFacts: [], reasonCodes: ['ACTIVE_DECISION_THREAD'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, exactEntityMatch: true, activeGoalMatch: true, materiality: 2, sourceConfidence: 1 }, traits: { ...DEFAULT_CANDIDATE_TRAITS },
  });
  for (const journey of state.guidanceJourneys ?? []) candidates.push({
    source: 'ACTIVE_GOAL', sourceOperationId: null, label: 'Continue an active guided journey', message: 'Continue this guided journey.',
    operationId: 'GUIDANCE_JOURNEY_CONTINUE', interactionType: 'CONVERSATION_CONTINUE', outcomeKey: 'CONTINUE_ACTIVE_GUIDANCE_JOURNEY',
    entityContext: { propertyId: input.propertyId, entityType: 'GUIDANCE_JOURNEY', entityId: journey.id, contextVersion: journey.contextVersion },
    tier: 'CONTINUE', slotClass: 'CONTINUE_WORK', requiredFacts: [], reasonCodes: ['ACTIVE_GUIDANCE_JOURNEY'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, exactEntityMatch: true, activeGoalMatch: true, materiality: 1, sourceConfidence: 1 }, traits: { ...DEFAULT_CANDIDATE_TRAITS },
  });
  return candidates.map((candidate) => SuggestedNextActionCandidateSchema.parse(candidate));
}
