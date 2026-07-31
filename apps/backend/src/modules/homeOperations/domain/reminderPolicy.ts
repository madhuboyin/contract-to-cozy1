import type { OperationalObligationType, RecommendationSafetyTier } from '@prisma/client';

/**
 * Item #19 (§5.15) Slice 0: reminder urgency is a function of how
 * consequential an obligation is (obligationType/safetyTier, already on
 * every OperationalWorkItem), not of how often it recurs — a one-shot
 * SAFETY_EMERGENCY finding and a daily habit both need a reminder policy,
 * and neither's urgency comes from cadence. Deliberately a pure function,
 * not a DB-persisted model or per-instance override — no real UI need for
 * user-configurable reminder cadence exists today (YAGNI).
 */
export interface ReminderPolicy {
  /** Inside this many days of dueAt, a reminder is material/urgent, not routine. */
  materialDeadlineDays: number;
  /** How far out from dueAt the reminder job considers this occurrence at all. */
  horizonDays: number;
  /** Fire a reminder off nextReviewAt for obligations with no dueAt at all (e.g. Guidance DECISION). */
  remindOnNextReview: boolean;
}

export const DEFAULT_REMINDER_POLICY: ReminderPolicy = {
  materialDeadlineDays: 2,
  horizonDays: 7,
  remindOnNextReview: false,
};

export function resolveReminderPolicy(
  obligationType: OperationalObligationType,
  safetyTier: RecommendationSafetyTier,
): ReminderPolicy {
  if (safetyTier === 'SAFETY_EMERGENCY') {
    // A safety-emergency obligation needs immediate attention, not a
    // routine multi-day heads-up window.
    return { materialDeadlineDays: 0, horizonDays: 2, remindOnNextReview: false };
  }
  if (obligationType === 'DECISION') {
    // Guidance's DECISION obligations never get a dueAt (Slice 8) — the
    // only way to remind about them at all is off nextReviewAt.
    return { ...DEFAULT_REMINDER_POLICY, remindOnNextReview: true };
  }
  return DEFAULT_REMINDER_POLICY;
}
