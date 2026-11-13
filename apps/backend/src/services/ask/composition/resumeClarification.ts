// FR-FACET-9(d): finds the composed parent turn a clarification click belongs to. The option actions the composed answer offers carry the part's own text as their message and the chosen operation as their operation, so
// the parent is found by the user's own recent composed turns in this session and property that still hold that exact clarification. Nothing is trusted from the click beyond those two values: the parent must belong to
// the same user, session and property, be settled and unexpired, and still list the clause with that operation among its stored options (resumeClarifiedComposedTurn checks the rest).
import type { AskExecution } from '@prisma/client';

export interface ResumeFinderDb {
  askExecution: { findMany(args: { where: Record<string, unknown>; orderBy: Record<string, string>; take: number }): Promise<AskExecution[]> };
}
const RECENT_COMPOSED_TURNS = 8;
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

interface StoredPart { reason?: string; clause?: string; options?: Array<{ operationId?: string }> }
const pendingPartsOf = (row: AskExecution): StoredPart[] => {
  const composition = row.parametersJson && typeof row.parametersJson === 'object' && !Array.isArray(row.parametersJson) ? (row.parametersJson as Record<string, unknown>).composition : null;
  const deferred = composition && typeof composition === 'object' ? (composition as { deferred?: unknown }).deferred : null;
  return Array.isArray(deferred) ? (deferred as StoredPart[]).filter((part) => part && part.reason === 'NEEDS_CLARIFICATION') : [];
};

/** The most recent settled composed turn of this user, session and property that still waits on exactly this clarification, or null. */
export async function findPendingComposedParent(db: ResumeFinderDb, input: { userId: string; sessionId: string; propertyId: string; message: string; operationId: string; now?: Date }): Promise<AskExecution | null> {
  const now = input.now ?? new Date();
  const rows = await db.askExecution.findMany({
    where: { userId: input.userId, sessionId: input.sessionId, propertyId: input.propertyId, parentRole: null, status: { in: ['READY_WITH_LIMITATIONS', 'ANSWERED'] } },
    orderBy: { createdAt: 'desc' }, take: RECENT_COMPOSED_TURNS,
  });
  const wanted = normalize(input.message);
  return rows.find((row) => (!row.expiresAt || row.expiresAt.getTime() > now.getTime())
    && pendingPartsOf(row).some((part) => normalize(part.clause ?? '') === wanted && (part.options ?? []).some((option) => option.operationId === input.operationId))) ?? null;
}
