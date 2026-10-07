import type { AskOperationResult } from '../askOperationRegistry';
import { DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, SuggestedNextActionCandidateSchema, type SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import { CAPABILITY_RECOMMENDATION_OUTCOME, isSafeCapabilityRecommendationOperation } from './suggestedNextActionRegistry';

export const CAPABILITY_RECOMMENDATION_PRODUCER_ID = 'capability.recommendations';
export { CAPABILITY_RECOMMENDATION_OUTCOME };

const capabilityReason = (id: string) => `CAPABILITY_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`.slice(0, 80).replace(/_+$/, '');

export function capabilityRecommendationCandidates(result: AskOperationResult, propertyId: string | null): SuggestedNextActionCandidate[] {
  if (!propertyId) return [];
  return result.blocks.flatMap((block) => block.type === 'CAPABILITY_LIST' ? block.capabilities : []).flatMap((capability) => {
    const launch = capability.inlineLaunch;
    if (!launch || !isSafeCapabilityRecommendationOperation(launch.operationId)) return [];
    return [SuggestedNextActionCandidateSchema.parse({
      source: 'CAPABILITY_RECOMMENDATION', sourceOperationId: null, label: capability.label.slice(0, 80), message: launch.message,
      operationId: launch.operationId, interactionType: 'CONVERSATION_CONTINUE', outcomeKey: CAPABILITY_RECOMMENDATION_OUTCOME,
      entityContext: { propertyId, entityType: null, entityId: null, contextVersion: null }, tier: 'RELATED', slotClass: 'GOVERNED_CAPABILITY',
      requiredFacts: [], reasonCodes: [capabilityReason(capability.id)], signals: { ...DEFAULT_CANDIDATE_SIGNALS, sourceConfidence: 1 }, traits: { ...DEFAULT_CANDIDATE_TRAITS },
    })];
  });
}

export function removeSelectedCapabilityDuplicates(result: AskOperationResult): AskOperationResult {
  const operations = new Set((result.suggestedNextActions ?? []).filter((action) => action.provenance.source === 'CAPABILITY_RECOMMENDATION' && action.outcomeKey === CAPABILITY_RECOMMENDATION_OUTCOME).map((action) => action.operationId));
  if (!operations.size) return result;
  const blocks: AskOperationResult['blocks'] = [];
  for (const block of result.blocks) {
    if (block.type !== 'CAPABILITY_LIST') { blocks.push(block); continue; }
    const capabilities = block.capabilities.filter((item) => !item.inlineLaunch || !operations.has(item.inlineLaunch.operationId));
    if (capabilities.length) blocks.push({ ...block, capabilities });
  }
  return { ...result, blocks };
}
