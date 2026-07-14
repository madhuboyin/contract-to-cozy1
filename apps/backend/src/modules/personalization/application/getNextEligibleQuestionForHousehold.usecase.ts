// apps/backend/src/modules/personalization/application/getNextEligibleQuestionForHousehold.usecase.ts
//
// PER-FR-010 ("offer one ranked progressive question with skip/later/caps").
// The pilot read API returns at most one eligible question to an OWNER.
import {
  loadActiveQuestionsForPlacement,
  loadAnswerHistoryForHousehold,
  LoadedProfileQuestion,
} from '../infrastructure/profileQuestionRepository';
import { isQuestionEligible, isWithinWeeklyCap, rankQuestions } from '../domain/profiling';

export interface NextEligibleQuestionResult {
  question: LoadedProfileQuestion | null;
}

export async function getNextEligibleQuestionForHousehold(
  householdId: string,
  placement: string,
): Promise<NextEligibleQuestionResult> {
  const [questions, answerHistory] = await Promise.all([
    loadActiveQuestionsForPlacement(placement),
    loadAnswerHistoryForHousehold(householdId),
  ]);

  const now = new Date();

  const askedTimestampsThisWeek = answerHistory.map((a) => a.askedAt);
  if (!isWithinWeeklyCap(askedTimestampsThisWeek, now)) {
    return { question: null };
  }

  const eligible = questions.filter((question) => {
    const priorAnswersForQuestion = answerHistory
      .filter((a) => a.questionId === question.id)
      .map((a) => ({ questionId: a.questionId, action: a.action as 'ANSWERED' | 'SKIPPED' | 'SNOOZED', nextEligibleAt: a.nextEligibleAt }));
    return isQuestionEligible(question, priorAnswersForQuestion, now);
  });

  if (eligible.length === 0) {
    return { question: null };
  }

  const [top] = rankQuestions(eligible);
  return { question: top };
}
