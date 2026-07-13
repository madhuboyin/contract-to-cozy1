// apps/backend/src/modules/personalization/domain/profiling.ts
//
// Progressive profiling eligibility/ranking — pure, no Prisma (same layering
// as domain/evaluator.ts, domain/scoring.ts).
//
// Rank formula is a deliberate simplification of 04-target-architecture.md's
// "(expected value × uncertainty reduction × current opportunity) / effort":
// only valueScore/effortScore are used here — uncertainty reduction and
// current opportunity both need live trait state this round doesn't compute
// (no household-scoped DerivedTrait rows exist yet — see schema.prisma's
// ProfileQuestion comment). Skip/later cooldowns and the weekly cap are
// applied exactly as specified (08-personalization-frd.md UC-10); the
// "≤1 question per session" cap is not — there's no session concept in this
// backend-only mechanism yet (nothing calls it from a live UI).
export const SKIP_COOLDOWN_DAYS = 90;
export const LATER_COOLDOWN_DAYS = 14;
export const WEEKLY_QUESTION_CAP = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type ProfileAnswerAction = 'ANSWERED' | 'SKIPPED' | 'SNOOZED';

export interface ProfileQuestionForEligibility {
  id: string;
  maxImpressions: number;
}

export interface ProfileAnswerRecord {
  questionId: string;
  action: ProfileAnswerAction;
  nextEligibleAt: Date | null;
}

/**
 * A question is eligible unless: the household already answered it (the
 * target fact is known), it's been shown maxImpressions times already, or a
 * prior skip/later cooldown hasn't expired yet.
 */
export function isQuestionEligible(
  question: ProfileQuestionForEligibility,
  priorAnswersForQuestion: ProfileAnswerRecord[],
  now: Date = new Date(),
): boolean {
  if (priorAnswersForQuestion.some((a) => a.action === 'ANSWERED')) return false;
  if (priorAnswersForQuestion.length >= question.maxImpressions) return false;
  if (priorAnswersForQuestion.some((a) => a.nextEligibleAt !== null && a.nextEligibleAt > now)) return false;
  return true;
}

export interface RankableQuestion {
  id: string;
  valueScore: number;
  effortScore: number;
}

function rankScore(q: RankableQuestion): number {
  const effort = q.effortScore > 0 ? q.effortScore : 0.01;
  return q.valueScore / effort;
}

/** Highest value/effort ratio first. Does not mutate the input array. */
export function rankQuestions<T extends RankableQuestion>(questions: T[]): T[] {
  return [...questions].sort((a, b) => rankScore(b) - rankScore(a));
}

/** True if the household can still be asked another question this week (fewer than WEEKLY_QUESTION_CAP so far). */
export function isWithinWeeklyCap(recentAskedTimestamps: Date[], now: Date = new Date()): boolean {
  const cutoff = now.getTime() - WEEK_MS;
  const countInWindow = recentAskedTimestamps.filter((t) => t.getTime() >= cutoff).length;
  return countInWindow < WEEKLY_QUESTION_CAP;
}

/** SKIPPED -> 90-day cooldown, SNOOZED -> 14-day cooldown, ANSWERED -> null (never re-asked; isQuestionEligible already filters on ANSWERED presence). */
export function computeNextEligibleAt(action: ProfileAnswerAction, now: Date = new Date()): Date | null {
  if (action === 'SKIPPED') return new Date(now.getTime() + SKIP_COOLDOWN_DAYS * DAY_MS);
  if (action === 'SNOOZED') return new Date(now.getTime() + LATER_COOLDOWN_DAYS * DAY_MS);
  return null;
}
