import {
  findPilotHousehold,
  listActivePilotRecommendations,
  optInPilotHousehold,
  resetPilotHousehold,
} from '../infrastructure/pilotRepository';
import { materializePilotRecommendationsForProperty } from './materializePilotRecommendations.usecase';
import { getNextEligibleQuestionForHousehold } from './getNextEligibleQuestionForHousehold.usecase';

export async function getPilotPersonalization(propertyId: string, userId: string) {
  const household = await findPilotHousehold(propertyId, userId);
  if (!household?.consentVersion) {
    return { optedIn: false, recommendations: [] };
  }

  await materializePilotRecommendationsForProperty(propertyId, household.id);
  const [storedRecommendations, nextQuestion] = await Promise.all([
    listActivePilotRecommendations(propertyId, household.id),
    getNextEligibleQuestionForHousehold(household.id, 'PILOT'),
  ]);
  const recommendations = storedRecommendations.map((recommendation) => ({
    ...recommendation,
    definition: { ...recommendation.definition, targetModule: 'Maintenance' },
  }));
  return { optedIn: true, consentedAt: household.consentedAt, recommendations, nextQuestion: nextQuestion.question };
}

export async function optInToPilotPersonalization(propertyId: string, userId: string) {
  const household = await optInPilotHousehold(propertyId, userId);
  await materializePilotRecommendationsForProperty(propertyId, household.id);
  return { optedIn: true, consentedAt: household.consentedAt };
}

export async function resetPilotPersonalization(propertyId: string, userId: string) {
  return { reset: await resetPilotHousehold(propertyId, userId) };
}
