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
import { loadExplicitRankingPreferences } from '../infrastructure/profileRankingRepository';
import { rankRecommendationsForOwner } from '../domain/profileRanking';

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
      rankingContext: { profileApplied: false, reasons: [] },
      nextQuestion: null,
      capabilities,
    };
  }
  const [storedRecommendations, nextQuestion, preferences] = await Promise.all([
    listActivePersonalizationRecommendations(propertyId, 25),
    household?.consentVersion && capabilities.canManageSensitiveProfile
      ? getNextEligibleQuestionForHousehold(household.id)
      : Promise.resolve({ question: null }),
    household?.consentVersion && capabilities.canManageSensitiveProfile
      ? loadExplicitRankingPreferences(household.id)
      : Promise.resolve({ agingInPlace: null, budgetSensitive: null }),
  ]);
  const ranked = rankRecommendationsForOwner(storedRecommendations, preferences);
  const recommendations = ranked.slice(0, 3).map(({ item: recommendation, score, priorityBand, rankingReasons }) => ({
    ...recommendation,
    score,
    priorityBand,
    rankingReasons,
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
    rankingContext: {
      profileApplied: recommendations.some((recommendation) => recommendation.rankingReasons.length > 0),
      reasons: Array.from(new Set(recommendations.flatMap((recommendation) => recommendation.rankingReasons))),
    },
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
