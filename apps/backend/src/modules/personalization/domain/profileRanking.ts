import { findPersonalizationDefinition } from '../catalog/personalizationDefinitions';
import { priorityBandFromScore, PriorityBand } from './scoring';

export interface ExplicitRankingPreferences {
  agingInPlace: boolean | null;
  budgetSensitive: boolean | null;
}

export interface RankableRecommendation {
  score: number | null;
  priorityBand: string | null;
  firstEligibleAt: Date | string;
  definition: { code: string };
}

export interface RankedRecommendation<T> {
  item: T;
  score: number;
  priorityBand: PriorityBand;
  rankingReasons: string[];
}

/**
 * Applies explicit owner preferences only at read time. It never changes
 * eligibility or persisted/shared recommendation scores. Routine preference
 * boosts are capped below the HIGH safety band so they cannot displace the
 * safety floor.
 */
export function rankRecommendationsForOwner<T extends RankableRecommendation>(
  recommendations: T[],
  preferences: ExplicitRankingPreferences,
): RankedRecommendation<T>[] {
  return recommendations
    .map((item) => {
      const definition = findPersonalizationDefinition(item.definition.code);
      const baseScore = item.score ?? 0;
      let score = baseScore;
      const rankingReasons: string[] = [];

      if (definition?.profileRanking?.agingInPlaceBoost && preferences.agingInPlace === true) {
        score += definition.profileRanking.agingInPlaceBoost;
        rankingReasons.push('Prioritized because you said you plan to stay in this home long-term.');
      }
      if (definition?.profileRanking?.budgetSensitiveBoost && preferences.budgetSensitive === true) {
        score += definition.profileRanking.budgetSensitiveBoost;
        rankingReasons.push('Prioritized because you asked us to favor lower-cost options when choices are similarly useful.');
      }

      if (definition?.safetyClass === 'ROUTINE' && rankingReasons.length > 0) {
        score = Math.max(baseScore, Math.min(score, 69));
      }
      score = Math.max(0, Math.min(score, 100));

      return { item, score, priorityBand: priorityBandFromScore(score), rankingReasons };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.item.firstEligibleAt).getTime() - new Date(a.item.firstEligibleAt).getTime();
    });
}
