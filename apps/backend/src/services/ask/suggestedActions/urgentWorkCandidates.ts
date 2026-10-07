// The Unified Home feed is the cross-domain authority for urgency. This adapter deliberately consumes only its governed
// NOW bucket and routes back through HOME_ACTIONS; it does not reproduce ranking, infer an entity target, or turn a read
// recommendation into a mutation.
import { getHomeActionFeed } from '../../homeActions.service';
import {
  DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, SuggestedNextActionCandidateSchema,
  type SuggestedNextActionCandidate,
} from './suggestedNextActionCandidate';

export const URGENT_WORK_PRODUCER_ID = 'home-actions.urgent';

export async function loadUrgentHomeActionState(input: { userId: string; propertyId: string }): Promise<{ nowCount: number }> {
  const feed = await getHomeActionFeed(input.propertyId, input.userId);
  return { nowCount: feed.buckets.NOW.length };
}

export async function urgentWorkCandidates(
  input: { userId: string; propertyId: string },
  loadState: typeof loadUrgentHomeActionState = loadUrgentHomeActionState,
): Promise<SuggestedNextActionCandidate[]> {
  const { nowCount } = await loadState(input);
  if (nowCount < 1) return [];
  return [SuggestedNextActionCandidateSchema.parse({
    source: 'PLATFORM_STATE', sourceOperationId: null,
    label: nowCount === 1 ? 'Review 1 urgent home action' : `Review ${nowCount} urgent home actions`,
    message: 'What needs my attention now?', operationId: 'HOME_ACTIONS', interactionType: 'CONVERSATION_CONTINUE',
    outcomeKey: 'REVIEW_URGENT_HOME_ACTIONS',
    entityContext: { propertyId: input.propertyId, entityType: null, entityId: null, contextVersion: 'home-actions-phase2-v1' },
    tier: 'CONTINUE', slotClass: 'URGENT_WORK', requiredFacts: [], reasonCodes: ['URGENT_HOME_ACTIONS_AVAILABLE'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, materiality: 3, sourceConfidence: 1 },
    traits: { ...DEFAULT_CANDIDATE_TRAITS },
  })];
}
