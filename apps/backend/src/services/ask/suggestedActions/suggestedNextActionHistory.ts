// Plan §6 rule 10: semantic-key hashes of suggested outcomes this session already completed (the current execution's own
// selection included). One bounded read, shared by the read path and the confirmation path so both suppress the same way.
import { prisma } from '../../../lib/prisma';

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
      select: { metadataJson: true },
    });
    return new Set(events.flatMap((event) => {
      const hash = (event.metadataJson as { semanticKeyHash?: unknown } | null)?.semanticKeyHash;
      return typeof hash === 'string' ? [hash] : [];
    }));
  } catch {
    // Typed-action history is optional; losing it only means a completed outcome may be offered again.
    return new Set();
  }
}
