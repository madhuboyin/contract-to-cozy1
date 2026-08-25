// Ask Intelligence FRD §22.1/Phase 9B "usefulness feedback" +
// "in-product fatigue/suppression behavior" deliverables. Deliberately
// reuses the existing generic `Feedback` model (already used by
// askOrchestrator.service.ts's submitAskExecutionFeedback for whole
// -execution UP/DOWN ratings) rather than a new table -- same
// find-latest-by-page-then-update-or-create pattern, just keyed to a
// per-Home-Action page instead of a per-execution one. No schema change
// required for this slice.

import { prisma } from '../../lib/prisma';
import { recordTypedFeedback } from '../feedback/typedFeedback.service';
import type { FeedbackReasonCode } from '../feedback/feedbackContract';

// FRD §17.2: engagement (a "not useful" rating) cannot override safety or
// consent -- this cooldown only ever threads a `suppressed` display flag
// through PRIORITY_LIST (see priorityListPolicy.ts), it never removes an
// item from the governed feed or blocks a safety-tier action.
export const HOME_ACTION_FEEDBACK_SUPPRESSION_COOLDOWN_DAYS = 14;

export function homeActionFeedbackPage(homeActionId: string): string {
  return `home-action:${homeActionId}`;
}

type UsefulnessRating = 'USEFUL' | 'NOT_USEFUL';

function toFeedbackRating(rating: UsefulnessRating): string {
  return rating === 'USEFUL' ? 'useful' : 'not-useful';
}

export async function recordHomeActionUsefulnessFeedback(params: {
  userId: string;
  propertyId: string | null;
  homeActionId: string;
  rating: UsefulnessRating;
  comment?: string | null;
  reasonCodes?: readonly FeedbackReasonCode[];
}): Promise<{ id: string; rating: UsefulnessRating }> {
  const page = homeActionFeedbackPage(params.homeActionId);
  const saved = await recordTypedFeedback({
    userId: params.userId,
    propertyId: params.propertyId,
    page,
    rating: toFeedbackRating(params.rating),
    comment: params.comment ?? null,
    targetType: 'HOME_ACTION',
    targetId: params.homeActionId,
    surface: 'COZY',
    reasonCodes: [...new Set<FeedbackReasonCode>([params.rating === 'USEFUL' ? 'USEFUL' : 'NOT_USEFUL', ...(params.reasonCodes ?? [])])],
  });
  return { id: saved.id, rating: params.rating };
}

/**
 * Which of the given Home Action ids currently carry an active,
 * within-cooldown "not useful" rating from this user on this property.
 * Callers thread the result into PRIORITY_LIST as a per-item `suppressed`
 * flag -- it never filters the underlying governed feed.
 */
export async function getSuppressedHomeActionIds(params: {
  userId: string;
  propertyId: string;
  homeActionIds: readonly string[];
}): Promise<Set<string>> {
  if (params.homeActionIds.length === 0) return new Set();
  const since = new Date(Date.now() - HOME_ACTION_FEEDBACK_SUPPRESSION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.feedback.findMany({
    where: {
      userId: params.userId,
      propertyId: params.propertyId,
      page: { in: params.homeActionIds.map(homeActionFeedbackPage) },
      rating: 'not-useful',
      createdAt: { gte: since },
    },
    select: { page: true },
  });
  return new Set(rows.map((row) => row.page.slice('home-action:'.length)));
}
