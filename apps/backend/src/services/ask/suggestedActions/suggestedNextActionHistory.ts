// Plan §6 rule 10: semantic-key hashes of suggested outcomes this session already completed (the current execution's own
// selection included). One bounded read, shared by the read path and the confirmation path so both suppress the same way.
import { prisma } from '../../../lib/prisma';
import { storedResultHasOpenCaptureRequests } from './suggestedActionCompletion';

const COMPLETED_STATUSES = ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'] as const;
const HISTORY_EVENT_LIMIT = 50;

/**
 * D-O11: the semantic key of the outcome THIS execution was launched to produce, so the answer just given is not offered again.
 * The only source is the SUGGESTED_ACTION_SELECTED event, which createAskExecution writes server-side only after the stored
 * offered-action ledger verified the selection; it is never inferred from the operation, the message or a client launch field.
 * An ordinary typed question has no such event and therefore an empty set. Failure leaves the set empty (the exclusion is optional).
 */
export async function loadCurrentOutcomeKeyHashes(executionId: string): Promise<Set<string>> {
  try {
    const events = await prisma.askExecutionEvent.findMany({
      where: { eventType: 'SUGGESTED_ACTION_SELECTED', executionId },
      take: 1,
      select: { metadataJson: true },
    });
    return new Set(events.flatMap((event) => {
      const hash = (event.metadataJson as { semanticKeyHash?: unknown } | null)?.semanticKeyHash;
      return typeof hash === 'string' ? [hash] : [];
    }));
  } catch {
    return new Set();
  }
}

export async function loadCompletedSuggestedActionKeyHashes(input: { executionId: string; sessionId: string; userId: string }): Promise<Set<string>> {
  try {
    const events = await prisma.askExecutionEvent.findMany({
      where: {
        eventType: 'SUGGESTED_ACTION_SELECTED',
        OR: [
          { executionId: input.executionId },
          { execution: { sessionId: input.sessionId, userId: input.userId, status: { in: [...COMPLETED_STATUSES] } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_EVENT_LIMIT,
      select: { executionId: true, metadataJson: true, execution: { select: { status: true, resultJson: true } } },
    });
    return new Set(events.flatMap((event) => {
      // READY_WITH_LIMITATIONS that still has an open capture prompt is an unfinished request, not a completed one (the current
      // execution's own selection always counts: it is the outcome this turn is producing).
      if (event.executionId !== input.executionId && event.execution?.status === 'READY_WITH_LIMITATIONS'
        && storedResultHasOpenCaptureRequests(event.execution.resultJson)) return [];
      const hash = (event.metadataJson as { semanticKeyHash?: unknown } | null)?.semanticKeyHash;
      return typeof hash === 'string' ? [hash] : [];
    }));
  } catch {
    // Typed-action history is optional; losing it only means a completed outcome may be offered again.
    return new Set();
  }
}

/**
 * This session's most recent completed turns (excluding the current execution), for the recent-prompt rule and recent-capability
 * suppression. A READY_WITH_LIMITATIONS turn that still has a blocking capture prompt is an unfinished request, so it is left out
 * (consistent with `loadCompletedSuggestedActionKeyHashes`). Rows are filtered BEFORE the limit, so unfinished turns do not shrink the
 * window. Shared by the execution, confirmation and capture finalizers. Failure yields [].
 */
export async function loadRecentCompletedTurns(input: { sessionId: string; userId: string; excludeExecutionId: string; take?: number }): Promise<Array<{ message: string; operationId: string | null }>> {
  const take = input.take ?? 5;
  try {
    const rows = await prisma.askExecution.findMany({
      where: { sessionId: input.sessionId, userId: input.userId, id: { not: input.excludeExecutionId }, status: { in: [...COMPLETED_STATUSES] } },
      orderBy: { updatedAt: 'desc' },
      take: take * 4,
      select: { message: true, operationId: true, status: true, resultJson: true },
    });
    return rows
      .filter((row) => !(row.status === 'READY_WITH_LIMITATIONS' && storedResultHasOpenCaptureRequests(row.resultJson)))
      .slice(0, take)
      .map((row) => ({ message: row.message, operationId: row.operationId }));
  } catch {
    return [];
  }
}

export async function loadRecentCompletedMessages(input: { sessionId: string; userId: string; excludeExecutionId: string; take?: number }): Promise<string[]> {
  return (await loadRecentCompletedTurns(input)).map((turn) => turn.message);
}
