// Default loader for the finalizer's actionable-profile completeness (exact-four, plan C.15.1). Used ONLY when a nominated candidate could
// occupy a profile or opportunity slot, so a starters-only turn pays nothing. It reads the full Property Context snapshot and the governed
// audience state; any failure returns `fraction: null` (the policy then runs profile-first and reports it), never a guess.
import { logger } from '../../../lib/logger';
import { getPropertyContext } from '../../../modules/propertyContext/application/getPropertyContext';
import { getFactDefinition, isFactApplicable } from '../../../modules/propertyContext/catalog/factCatalog';
import { PROPERTY_AREA_CAPTURE_SCOPES } from '../../../modules/propertyContext/catalog/featureRequirementRegistry';
import type { PropertyContextSnapshot } from '../../../modules/propertyContext/domain/contracts';
import { computeActionableCompleteness, type ActionableCompleteness, type ProfileFactObservation } from './actionableProfileRegistry';
import { loadProfileAudienceState, type ProfileAudienceState } from './profileAudienceAdapter';

export function actionableProfileStateFromSources(
  snapshot: PropertyContextSnapshot,
  audience: ProfileAudienceState,
): ActionableCompleteness {
  const facts: Record<string, ProfileFactObservation> = {};
  for (const [key, fact] of Object.entries(snapshot.facts)) facts[key] = { state: fact.state as ProfileFactObservation['state'], value: fact.value };
  return computeActionableCompleteness({
    facts, activeAudiences: audience.audiences, audienceUncertain: !audience.ok,
    isCatalogApplicable: (factKey) => {
      try { return isFactApplicable(getFactDefinition(factKey), snapshot.facts); } catch { return true; }
    },
  });
}

export async function loadActionableProfileState(input: { userId: string; propertyId: string }): Promise<ActionableCompleteness> {
  const [snapshot, audience] = await Promise.all([
    getPropertyContext(input.propertyId, { userId: input.userId }, { scopes: [...PROPERTY_AREA_CAPTURE_SCOPES] }),
    loadProfileAudienceState(input.propertyId),
  ]);
  return actionableProfileStateFromSources(snapshot, audience);
}

export async function loadActionableCompletenessForFinalizer(input: { userId: string; propertyId: string }): Promise<{ fraction: number | null; audienceUncertain: boolean }> {
  try {
    const completeness = await loadActionableProfileState(input);
    return { fraction: completeness.fraction, audienceUncertain: completeness.audienceUncertain };
  } catch (error) {
    logger.warn({ err: error, propertyId: input.propertyId }, '[ask-suggested-actions] actionable completeness load failed');
    return { fraction: null, audienceUncertain: true };
  }
}
