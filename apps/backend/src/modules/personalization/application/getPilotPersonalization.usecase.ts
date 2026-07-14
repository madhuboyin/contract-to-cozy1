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
  if (!household?.consentVersion) {
    return { optedIn: false, recommendations: [], capabilities };
  }

  await materializePilotRecommendationsForProperty(propertyId, household.id);
  const [storedRecommendations, nextQuestion] = await Promise.all([
    listActivePilotRecommendations(propertyId, household.id),
    capabilities.canManageSensitiveProfile
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
    optedIn: true,
    consentedAt: household.consentedAt,
    recommendations,
    nextQuestion: nextQuestion.question,
    capabilities,
  };
}

export async function optInToPilotPersonalization(propertyId: string, userId: string) {
  const household = await optInPilotHousehold(propertyId, userId);
  await materializePilotRecommendationsForProperty(propertyId, household.id);
  return { optedIn: true, consentedAt: household.consentedAt };
}

export async function resetPilotPersonalization(propertyId: string, userId: string) {
  return { reset: await resetPilotHousehold(propertyId, userId) };
}

export async function refreshPilotPersonalization(propertyId: string) {
  const household = await findPilotHouseholdForProperty(propertyId);
  if (!household?.consentVersion) return { optedIn: false, evaluated: 0, active: 0 };
  const result = await materializePilotRecommendationsForProperty(propertyId, household.id, 'PILOT_MANUAL');
  return { optedIn: true, ...result };
}
