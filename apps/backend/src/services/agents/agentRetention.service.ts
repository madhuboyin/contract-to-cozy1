// apps/backend/src/services/agents/agentRetention.service.ts
//
// IPD-003 retention/purge for the Phase 2 agent runtime. Two clocks: AgentRun
// is metadata-only and keeps a longer window (default 90d) than the invocation
// tables (default 30d); AgentState is purged its own grace window (default 7d)
// after its pauseExpiresAt. Every row carries a fixed expiresAt stamped at
// creation, so purge is a single indexed `expiresAt <= now` batched delete —
// modelled on askRetention.service.ts. ToolInvocation/LLMInvocation/AgentState
// also cascade from AgentRun as a structural backstop.

import { prisma } from '../../lib/prisma';
import { agentRuntimeDeletionsTotal } from '../../lib/metrics';
import { readAgentRuntimeControls } from '../../config/agentRuntimeControls';

type PurgeDb = Pick<typeof prisma, 'agentRun' | 'agentState' | 'toolInvocation' | 'llmInvocation' | 'agentRunReservation'>;
type EraseDb = PurgeDb;

const PURGE_TABLES = ['toolInvocation', 'llmInvocation', 'agentState', 'agentRunReservation', 'agentRun'] as const;
type PurgeTable = (typeof PURGE_TABLES)[number];

export interface AgentRuntimePurgeResult {
  deleted: Record<PurgeTable, number>;
  total: number;
}

async function purgeTable(
  db: PurgeDb,
  table: PurgeTable,
  now: Date,
  batchSize: number,
): Promise<number> {
  const delegate = db[table] as {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
  let total = 0;
  // Bounded loop: each pass removes at most `batchSize`; stop when a short page
  // shows the backlog is drained. The 200-iteration ceiling caps a single run.
  for (let pass = 0; pass < 200; pass += 1) {
    const rows = await delegate.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: batchSize,
    });
    if (!rows.length) break;
    const deleted = await delegate.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    total += deleted.count;
    agentRuntimeDeletionsTotal.inc({ table, reason: 'expired' }, deleted.count);
    if (rows.length < batchSize) break;
  }
  return total;
}

export async function purgeExpiredAgentRuntime(
  now: Date = new Date(),
  db: PurgeDb = prisma,
  batchSize: number = readAgentRuntimeControls().purgeBatchSize,
): Promise<AgentRuntimePurgeResult> {
  const deleted = {} as Record<PurgeTable, number>;
  for (const table of PURGE_TABLES) {
    deleted[table] = await purgeTable(db, table, now, batchSize);
  }
  return { deleted, total: Object.values(deleted).reduce((sum, n) => sum + n, 0) };
}

/**
 * Right-to-erasure hook. Deletes every agent-runtime row for a user immediately,
 * ignoring expiresAt — wired into the account-deletion cascade, which only
 * anonymizes the User row and so cannot rely on a User FK cascade. Children of
 * AgentRun cascade automatically; reservations are removed explicitly because an
 * unresolved reservation has no run to cascade from.
 */
export async function eraseAgentRuntimeForUser(db: EraseDb, userId: string): Promise<number> {
  const reservations = await db.agentRunReservation.deleteMany({ where: { principalUserId: userId } });
  const runs = await db.agentRun.deleteMany({ where: { principalUserId: userId } });
  const total = reservations.count + runs.count;
  if (reservations.count) agentRuntimeDeletionsTotal.inc({ table: 'agentRunReservation', reason: 'user_erasure' }, reservations.count);
  if (runs.count) agentRuntimeDeletionsTotal.inc({ table: 'agentRun', reason: 'user_erasure' }, runs.count);
  return total;
}
