import {
  findHouseholdForPropertyOwner,
  findConsentedHouseholdForProperty,
  listActivePersonalizationRecommendations,
  enableHouseholdProfile,
  resetHouseholdProfile,
} from '../infrastructure/personalizationRepository';
import { materializeRecommendationsForProperty } from './materializeRecommendations.usecase';
import { getNextEligibleQuestionForHousehold } from './getNextEligibleQuestionForHousehold.usecase';
import type { PersonalizationCapabilities } from '../domain/capabilityPolicy';

export async function getPersonalization(
  propertyId: string,
  userId: string,
  capabilities: PersonalizationCapabilities,
) {
  const household = capabilities.canManageSensitiveProfile
    ? await findConsentedHouseholdForProperty(propertyId, userId)
    : null;
  const materialization = await materializeRecommendationsForProperty(propertyId);
  if (materialization.paused) {
    return {
      available: false,
      profileEnabled: Boolean(household?.consentVersion),
      consentedAt: household?.consentedAt ?? null,
      recommendations: [],
      nextQuestion: null,
      capabilities,
    };
  }
  const [storedRecommendations, nextQuestion] = await Promise.all([
    listActivePersonalizationRecommendations(propertyId),
    household?.consentVersion && capabilities.canManageSensitiveProfile
      ? getNextEligibleQuestionForHousehold(household.id)
      : Promise.resolve({ question: null }),
  ]);
  const recommendations = storedRecommendations.map((recommendation) => ({
    ...recommendation,
    explanations: recommendation.explanations.map((explanation) => ({
      ...explanation,
      evidenceJson: capabilities.canViewSensitiveEvidence ? explanation.evidenceJson : null,
    })),
    definition: { ...recommendation.definition, targetModule: 'Maintenance' },
  }));
  return {
    available: true,
    profileEnabled: Boolean(household?.consentVersion),
    consentedAt: household?.consentedAt ?? null,
    recommendations,
    nextQuestion: nextQuestion.question,
    capabilities,
  };
}

export async function enableOptionalProfile(propertyId: string, userId: string) {
  const household = await enableHouseholdProfile(propertyId, userId);
  return { profileEnabled: true, consentedAt: household.consentedAt };
}

export async function resetOptionalProfile(propertyId: string, userId: string) {
  return { reset: await resetHouseholdProfile(propertyId, userId) };
}

export async function refreshPersonalization(propertyId: string) {
  return materializeRecommendationsForProperty(propertyId, 'MANUAL');
}
