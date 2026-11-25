// BICC-BUY-011: the conversation history the fair-housing check may read. Only the caller's own, same-session, top-level turns that Ask actually delivered (a terminal,
// user-visible status) count, newest first, at most two. A failed, cancelled, interrupted or still-running turn never counts, so it cannot be treated as something the person saw.
import type { FairHousingHistoryTurn } from './fairHousing';

export const FAIR_HOUSING_HISTORY_STATUSES = ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS', 'NOT_APPLICABLE', 'OUT_OF_SCOPE'] as const;
export const FAIR_HOUSING_HISTORY_TURNS = 2;

export interface FairHousingHistoryDb {
  askExecution: { findMany(args: Record<string, unknown>): Promise<Array<{ message: string; reasonCode: string | null; operationId: string | null }>> };
}

export async function loadFairHousingHistory(db: FairHousingHistoryDb, input: { userId: string; sessionId: string }): Promise<Array<FairHousingHistoryTurn & { operationId: string | null }>> {
  const rows = await db.askExecution.findMany({
    where: { sessionId: input.sessionId, userId: input.userId, parentRole: null, status: { in: [...FAIR_HOUSING_HISTORY_STATUSES] } },
    orderBy: { createdAt: 'desc' },
    take: FAIR_HOUSING_HISTORY_TURNS,
    select: { message: true, reasonCode: true, operationId: true },
  });
  return rows.map((row) => ({ message: row.message, reasonCode: row.reasonCode ?? null, operationId: row.operationId ?? null }));
}
