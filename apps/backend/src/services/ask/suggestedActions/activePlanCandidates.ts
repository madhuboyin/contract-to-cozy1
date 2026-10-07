import { sellHoldRentDecisionFamilyAdapter } from '../../decisionPlatform/domainSnapshotAdapters';
import {
  DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, SuggestedNextActionCandidateSchema,
  type SuggestedNextActionCandidate,
} from './suggestedNextActionCandidate';

export const ACTIVE_PLAN_PRODUCER_ID = 'active-plan.decision-thread';

export async function loadActivePlanState(input: { propertyId: string }): Promise<{ sellHoldRentActive: boolean }> {
  const selection = await sellHoldRentDecisionFamilyAdapter.selectThread(input.propertyId, input.propertyId);
  return { sellHoldRentActive: selection.kind === 'UNIQUE' };
}

export async function activePlanCandidates(
  input: { propertyId: string },
  loadState: typeof loadActivePlanState = loadActivePlanState,
): Promise<SuggestedNextActionCandidate[]> {
  const state = await loadState(input);
  if (!state.sellHoldRentActive) return [];
  return [SuggestedNextActionCandidateSchema.parse({
    source: 'ACTIVE_GOAL', sourceOperationId: null,
    label: 'Continue your sell, hold, or rent plan', message: 'Show the latest on my sell, hold, or rent plan.',
    operationId: 'SELL_HOLD_RENT_ANALYSIS', interactionType: 'CONVERSATION_CONTINUE', outcomeKey: 'CONTINUE_SELL_HOLD_RENT_PLAN',
    entityContext: { propertyId: input.propertyId, entityType: null, entityId: null, contextVersion: null },
    tier: 'CONTINUE', slotClass: 'CONTINUE_WORK', requiredFacts: [], reasonCodes: ['ACTIVE_DECISION_THREAD'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, activeGoalMatch: true, materiality: 2, sourceConfidence: 1 },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
  })];
}
