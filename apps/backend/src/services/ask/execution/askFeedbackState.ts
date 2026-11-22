import { prisma } from '../../../lib/prisma';
import type { AskExecutionResponse } from '../../../productFramework/ask/ask.contract';

// BICC-UX-003 (owner decision 2026-11-22): the saved rating and its attempt identity come back with the execution after a reload.
// Feedback is stored per execution, and a regenerated answer is a NEW execution (its own id), so a rating is never carried over from
// one attempt to another: each response reports only the feedback recorded against its own execution id.
export type AskSavedFeedback = NonNullable<AskExecutionResponse['feedback']>;

export async function savedFeedbackByExecution(userId: string, executionIds: readonly string[]): Promise<Map<string, AskSavedFeedback>> {
  const unique = [...new Set(executionIds)];
  if (!unique.length) return new Map();
  const rows = await prisma.feedback.findMany({
    where: { userId, targetType: 'ASK_EXECUTION', targetId: { in: unique } },
    orderBy: { createdAt: 'desc' },
    select: { targetId: true, rating: true, comment: true, createdAt: true },
  });
  const latest = new Map<string, AskSavedFeedback>();
  for (const row of rows) {
    if (!row.targetId || latest.has(row.targetId)) continue;
    const rating = row.rating.toLowerCase() === 'up' ? 'UP' : row.rating.toLowerCase() === 'down' ? 'DOWN' : null;
    if (!rating) continue;
    latest.set(row.targetId, { rating, attemptExecutionId: row.targetId, comment: row.comment, submittedAt: row.createdAt.toISOString() });
  }
  return latest;
}

/** Returns the responses with each one's own saved feedback (or null). Child executions are left as they are. */
export async function withSavedFeedback(userId: string, responses: readonly AskExecutionResponse[]): Promise<AskExecutionResponse[]> {
  const feedback = await savedFeedbackByExecution(userId, responses.map((response) => response.executionId));
  return responses.map((response) => ({ ...response, feedback: feedback.get(response.executionId) ?? null }));
}
