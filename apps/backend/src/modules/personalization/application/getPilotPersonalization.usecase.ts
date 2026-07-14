import {
  findPilotHousehold,
  findPilotHouseholdForProperty,
  listActivePilotRecommendations,
  optInPilotHousehold,
  resetPilotHousehold,
} from '../infrastructure/pilotRepository';
import { materializePilotRecommendationsForProperty } from './materializePilotRecommendations.usecase';
import { getNextEligibleQuestionForHousehold } from './getNextEligibleQuestionForHousehold.usecase';
import type { PersonalizationCapabilities } from '../domain/capabilityPolicy';

export async function getPilotPersonalization(
  propertyId: string,
  capabilities: PersonalizationCapabilities,
) {
  const household = await findPilotHouseholdForProperty(propertyId);
  await materializePilotRecommendationsForProperty(propertyId);
  const [storedRecommendations, nextQuestion] = await Promise.all([
    listActivePilotRecommendations(propertyId, household?.id),
    household?.consentVersion && capabilities.canManageSensitiveProfile
      ? getNextEligibleQuestionForHousehold(household.id, 'PILOT')
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
    profileEnabled: Boolean(household?.consentVersion),
    consentedAt: household?.consentedAt ?? null,
    recommendations,
    nextQuestion: nextQuestion.question,
    capabilities,
  };
}

export async function optInToPilotPersonalization(propertyId: string, userId: string) {
  const household = await optInPilotHousehold(propertyId, userId);
  return { profileEnabled: true, consentedAt: household.consentedAt };
}

export async function resetPilotPersonalization(propertyId: string, userId: string) {
  return { reset: await resetPilotHousehold(propertyId, userId) };
}

export async function refreshPilotPersonalization(propertyId: string) {
  const result = await materializePilotRecommendationsForProperty(propertyId, 'MANUAL');
  return result;
}
