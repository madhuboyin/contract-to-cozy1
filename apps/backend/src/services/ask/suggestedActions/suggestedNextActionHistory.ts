// Plan §6 rule 10: semantic-key hashes of suggested outcomes this session already completed (the current execution's own
// selection included). One bounded read, shared by the read path and the confirmation path so both suppress the same way.
import { prisma } from '../../../lib/prisma';

const COMPLETED_STATUSES = ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'] as const;
const HISTORY_EVENT_LIMIT = 50;

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
