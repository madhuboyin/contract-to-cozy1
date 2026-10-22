import { DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, SuggestedNextActionCandidateSchema, type SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import { OPERATION_SPECIFIC_CONTINUATION_RECIPES } from './operationSpecificContinuationRecipes';
import type { AskOperationId } from '../askOperationRegistry';
import type { OperationSpecificContinuationState } from './operationSpecificContinuationState';

export const OPERATION_SPECIFIC_CONTINUATION_PRODUCER_ID = 'operation-result.domain-continuations';

export function operationSpecificContinuationCandidates(
  sourceOperationId: string | null,
  propertyId: string | null,
  state?: OperationSpecificContinuationState,
): SuggestedNextActionCandidate[] {
  if (!sourceOperationId || !propertyId) return [];
  const recipes = OPERATION_SPECIFIC_CONTINUATION_RECIPES[sourceOperationId as AskOperationId] ?? [];
  return recipes.filter((entry) => {
    if (!state) return true;
    if (entry.operationId === 'MAINTENANCE_STATUS') return state.hasPendingMaintenance;
    if (entry.operationId === 'INSPECTION_FINDINGS') return state.hasOpenInspectionFindings;
    if (entry.operationId === 'RECALL_REVIEW') return state.hasUnresolvedRecallMatches;
    return true;
  }).map((entry) => SuggestedNextActionCandidateSchema.parse({
    source: 'OPERATION_RESULT',
    sourceOperationId,
    label: entry.label,
    message: entry.message,
    operationId: entry.operationId,
    interactionType: 'CONVERSATION_CONTINUE',
    outcomeKey: entry.outcomeKey,
    entityContext: { propertyId, entityType: null, entityId: null, contextVersion: null },
    tier: 'CONTINUE',
    slotClass: 'CONTINUE_WORK',
    requiredFacts: [],
    reasonCodes: [entry.reasonCode],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, currentResultOwnership: true, sourceConfidence: 1 },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
  }));
}
