import { getPropertyContext } from '../../../modules/propertyContext/application/getPropertyContext';
import { PROPERTY_AREA_CAPTURE_SCOPES } from '../../../modules/propertyContext/catalog/featureRequirementRegistry';
import type { PropertyContextScope } from '../../../modules/propertyContext/domain/contracts';
import { actionableProfileStateFromSources } from './actionableCompletenessLoader';
import { homeOpportunityStateFromSnapshot, type HomeOpportunityState } from './homeOpportunityCandidates';
import { loadProfileAudienceState } from './profileAudienceAdapter';
import type { ActionableCompleteness } from './actionableProfileRegistry';

export const SUGGESTED_ACTION_SHARED_PROPERTY_SCOPES: readonly PropertyContextScope[] = [
  ...PROPERTY_AREA_CAPTURE_SCOPES,
  'FINANCIAL',
  'COVERAGE',
  'INSPECTION',
];

export interface SuggestedActionSharedPropertyState {
  profile: ActionableCompleteness;
  opportunities: HomeOpportunityState;
}

export interface SuggestedActionSharedPropertyStateDeps {
  loadContext?: typeof getPropertyContext;
  loadAudience?: typeof loadProfileAudienceState;
  now?: () => Date;
}

/** One authorized snapshot shared by every Property Context-backed suggested-action consumer in a finalization. */
export async function loadSuggestedActionSharedPropertyState(
  input: { userId: string; propertyId: string },
  deps: SuggestedActionSharedPropertyStateDeps = {},
): Promise<SuggestedActionSharedPropertyState> {
  const [snapshot, audience] = await Promise.all([
    (deps.loadContext ?? getPropertyContext)(
      input.propertyId,
      { userId: input.userId },
      { scopes: [...SUGGESTED_ACTION_SHARED_PROPERTY_SCOPES] },
    ),
    (deps.loadAudience ?? loadProfileAudienceState)(input.propertyId),
  ]);
  const now = (deps.now ?? (() => new Date()))();
  return {
    profile: actionableProfileStateFromSources(snapshot, audience),
    opportunities: homeOpportunityStateFromSnapshot(snapshot, now),
  };
}
