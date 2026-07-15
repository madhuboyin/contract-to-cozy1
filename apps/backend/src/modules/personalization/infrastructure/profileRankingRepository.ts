import { prisma } from '../../../lib/prisma';
import type { ExplicitRankingPreferences } from '../domain/profileRanking';

const RANKING_QUESTION_CODES = ['goal_aging_in_place', 'preference_budget_posture'] as const;

function booleanAnswer(answerJson: unknown): boolean | null {
  if (!answerJson || typeof answerJson !== 'object' || Array.isArray(answerJson)) return null;
  const value = (answerJson as Record<string, unknown>).value;
  return typeof value === 'boolean' ? value : null;
}

export async function loadExplicitRankingPreferences(
  householdId: string,
): Promise<ExplicitRankingPreferences> {
  const answers = await prisma.profileAnswer.findMany({
    where: {
      householdId,
      action: 'ANSWERED',
      question: { code: { in: [...RANKING_QUESTION_CODES] } },
    },
    select: {
      answerJson: true,
      question: { select: { code: true } },
    },
  });

  const preferences: ExplicitRankingPreferences = { agingInPlace: null, budgetSensitive: null };
  for (const answer of answers) {
    if (answer.question.code === 'goal_aging_in_place') {
      preferences.agingInPlace = booleanAnswer(answer.answerJson);
    }
    if (answer.question.code === 'preference_budget_posture') {
      preferences.budgetSensitive = booleanAnswer(answer.answerJson);
    }
  }
  return preferences;
}
