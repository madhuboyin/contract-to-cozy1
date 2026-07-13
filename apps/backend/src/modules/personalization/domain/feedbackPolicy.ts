// apps/backend/src/modules/personalization/domain/feedbackPolicy.ts
//
// PER-FDBK-001: "Explicit negative feedback shall affect suppression more
// than implicit non-engagement." Pure, no Prisma/infra imports — the policy
// itself is unit-tested in isolation from any mock, same layering as
// domain/evaluator.ts and domain/scoring.ts.
//
// Two independently-assertable "more than" relationships:
//  1. explicit negative (nonzero suppression effect) vs. implicit (always
//     null, zero effect) — the literal PER-FDBK-001 contrast.
//  2. NOT_RELEVANT (indefinite, DEFINITION-wide) vs. DISMISSED (30-day,
//     narrower DEDUPE_KEY-scoped) — a graduated-severity case within
//     "explicit negative."
//
// SuppressionScope/SuppressionReason are defined here (domain) rather than in
// infrastructure/suppressionRepository.ts, which imports them from here —
// domain must not depend on infrastructure.
export type SuppressionScope = 'DEFINITION' | 'CATEGORY' | 'DEDUPE_KEY';
export type SuppressionReason = 'USER_DISMISSED' | 'COMPLETED' | 'SYSTEM';

export const DISMISSED_SUPPRESSION_DAYS = 30;

export interface SuppressionDirective {
  scope: SuppressionScope;
  /** null = indefinite. */
  until: Date | null;
  reason: SuppressionReason;
}

/**
 * Decides whether a feedback event should suppress the recommendation it's
 * attached to, and how broadly/for how long. Implicit feedback (explicit:
 * false) never suppresses in this slice — only explicit negative signals do.
 */
export function decideSuppressionForFeedback(
  type: string,
  explicit: boolean,
  now: Date = new Date(),
): SuppressionDirective | null {
  if (!explicit) {
    return null;
  }

  if (type === 'NOT_RELEVANT') {
    return { scope: 'DEFINITION', until: null, reason: 'USER_DISMISSED' };
  }

  if (type === 'DISMISSED') {
    return {
      scope: 'DEDUPE_KEY',
      until: new Date(now.getTime() + DISMISSED_SUPPRESSION_DAYS * 24 * 60 * 60 * 1000),
      reason: 'USER_DISMISSED',
    };
  }

  return null;
}
