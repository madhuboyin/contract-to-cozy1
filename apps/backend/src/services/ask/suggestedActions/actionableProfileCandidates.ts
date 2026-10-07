// Governed actionable-profile nominations for exact-four. One batched Property Context read produces at most
// one candidate per area; the verified outcome key selects the area and the launch handler recomputes the exact
// fact allowlist, so neither the label nor message is authoritative.
import { AREA_CAPTURE_MESSAGES, areaLabel } from '../askHandlerSupport';
import { PROFILE_AREAS, PROFILE_AREA_OUTCOMES } from './actionableProfileRegistry';
import { loadActionableProfileState } from './actionableCompletenessLoader';
import {
  DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, SuggestedNextActionCandidateSchema,
  type SuggestedNextActionCandidate,
} from './suggestedNextActionCandidate';

export const ACTIONABLE_PROFILE_PRODUCER_ID = 'profile.actionable-gaps';

export async function actionableProfileCandidates(input: {
  userId: string;
  propertyId: string;
}, loadState: typeof loadActionableProfileState = loadActionableProfileState): Promise<SuggestedNextActionCandidate[]> {
  const completeness = await loadState(input);
  return PROFILE_AREAS.flatMap((area) => {
    const unresolved = completeness.unresolvedByArea[area];
    if (!unresolved?.askNowFactKeys.length) return [];
    const count = unresolved.askNowFactKeys.length;
    const noun = count === 1 ? 'detail' : 'details';
    return [SuggestedNextActionCandidateSchema.parse({
      source: 'MISSING_DETAIL',
      sourceOperationId: null,
      label: `Add ${areaLabel(area).toLowerCase()} ${noun}`,
      message: AREA_CAPTURE_MESSAGES[area],
      operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE',
      interactionType: 'START_WORKFLOW',
      outcomeKey: PROFILE_AREA_OUTCOMES[area],
      entityContext: { propertyId: input.propertyId, entityType: null, entityId: null, contextVersion: completeness.denominatorVersion },
      tier: 'RELATED',
      slotClass: 'PROFILE_GAP',
      requiredFacts: [],
      reasonCodes: ['ACTIONABLE_PROFILE_GAP', `PROFILE_AREA_${area}`],
      signals: { ...DEFAULT_CANDIDATE_SIGNALS, materiality: unresolved.maxMateriality, sourceConfidence: 1 },
      traits: { ...DEFAULT_CANDIDATE_TRAITS },
    })];
  });
}
