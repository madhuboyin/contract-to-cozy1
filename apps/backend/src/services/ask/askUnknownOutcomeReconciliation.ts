// Records, durably, the executions whose confirmed command may or may not have run (Sole Homeowner Interface FR-WORK-001, "unknown-outcome
// executions"). A confirmed command claims a receipt with a short lease and completes it in the same transaction as the execution's final
// state. If the process dies after the claim, the lease expires with nothing recorded: the domain write may have committed or not, and Ask
// cannot tell. Until now that showed only as an execution stuck in RUNNING. This sweep moves exactly those executions to OUTCOME_UNKNOWN.
//
// It is NOT a failure detector. An ordinary failure either releases its claim (FAILED/EXPIRED with "no action performed") or leaves a
// retryable status; a long-running command whose lease is still live stays RUNNING. Only "claimed, lease expired, never completed" counts,
// and only after a grace period. It writes nothing but the status, one event and the receipt's `outcomeUnknownAt`; the domain command is
// never replayed here. Reconciliation is the homeowner's (or a retry's) idempotent confirm, which replays only the already-confirmed input.
import { prisma } from '../../lib/prisma';
import { asInputJson } from './askHandlerSupport';

/** The lease is 60s; waiting longer than a full extra lease means no live attempt can still be holding it. */
export const ASK_UNKNOWN_OUTCOME_GRACE_MS = 5 * 60_000;

export interface AskUnknownOutcomeResult {
  recorded: number;
}

export async function recordUnknownOutcomeExecutions(options: { now?: Date; batchSize?: number } = {}): Promise<AskUnknownOutcomeResult> {
  const now = options.now ?? new Date();
  const take = Math.max(1, Math.min(options.batchSize ?? 200, 1_000));
  const lapsedBefore = new Date(now.getTime() - ASK_UNKNOWN_OUTCOME_GRACE_MS);
  const receipts = await prisma.askConfirmationReceipt.findMany({
    where: { status: 'CLAIMED', completedAt: null, outcomeUnknownAt: null, leaseExpiresAt: { lte: lapsedBefore }, execution: { status: 'RUNNING' } },
    select: { id: true, executionId: true, attemptCount: true, leaseExpiresAt: true },
    orderBy: { leaseExpiresAt: 'asc' },
    take,
  });
  let recorded = 0;
  for (const receipt of receipts) {
    // Guarded on the receipt still being an expired, uncompleted claim: a confirm that completed, or re-claimed the lease, since the read
    // makes this a no-op, so the sweep can never mark a settled command unknown.
    const marked = await prisma.askConfirmationReceipt.updateMany({
      where: { id: receipt.id, status: 'CLAIMED', completedAt: null, outcomeUnknownAt: null, leaseExpiresAt: { lte: lapsedBefore } },
      data: { outcomeUnknownAt: now },
    });
    if (marked.count !== 1) continue;
    const moved = await prisma.askExecution.updateMany({
      where: { id: receipt.executionId, status: 'RUNNING' },
      data: { status: 'OUTCOME_UNKNOWN', reasonCode: 'ASK_OUTCOME_UNKNOWN' },
    });
    if (moved.count !== 1) {
      // The execution moved on after the receipt was marked (a confirm finished it): undo the mark so no settled command reads as unknown.
      await prisma.askConfirmationReceipt.updateMany({ where: { id: receipt.id, outcomeUnknownAt: now }, data: { outcomeUnknownAt: null } });
      continue;
    }
    await prisma.askExecutionEvent.create({
      data: {
        executionId: receipt.executionId,
        eventType: 'OUTCOME_UNKNOWN_RECORDED',
        metadataJson: asInputJson({ attemptCount: receipt.attemptCount, leaseExpiredAt: receipt.leaseExpiresAt.toISOString() }),
      },
    });
    recorded += 1;
  }
  return { recorded };
}
