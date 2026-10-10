// Server-owned reconciliation of discovery-launched proposals and questions that nobody opened again (capability discovery plan, Phase 6;
// Inline Workspace FRD IW-SHELL-021). A pending interaction already has an authoritative expiry, stored with it (`clarification.expiresAt` or
// `confirmation.expiresAt`) and applied lazily by expirePendingInteraction when someone next touches the execution. Without a sweep, a proposal
// that nobody touches again stays pending forever and its capability is never marked ABANDONED. This sweep reuses that exact rule and that exact
// transition; it adds no discovery-specific timer and nothing runs in the browser.
//
// Scope is deliberately narrow: only executions that carry a discovery claim are expired early. Every other pending interaction keeps expiring
// lazily, as before, so the sweep changes no behaviour for them.
import type { AskExecution } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { INTERACTIVE_ASK_STATUSES, expirePendingInteraction, pendingInteractionExpiresAt } from './execution/askSessions';
import { readStoredDiscoveryClaim, recordAskCapabilityLifecycle } from './askCapabilityLifecycle';

/** Rows older than this are left to normal retention; a proposal that old is expired long since and its ABANDONED was recorded or never will be. */
export const ASK_PENDING_RECONCILIATION_LOOKBACK_DAYS = 14;
const TIME_EXPIRY_REASONS = ['ASK_EXECUTION_EXPIRED', 'ASK_CONFIRMATION_EXPIRED'];

const hasDiscoveryClaim = (execution: Pick<AskExecution, 'launchContextJson'>): boolean => readStoredDiscoveryClaim(execution.launchContextJson).claim != null;

export interface AskPendingReconciliationResult {
  /** Pending discovery-launched interactions whose stored expiry had passed, now moved to EXPIRED (each records ABANDONED once). */
  expired: number;
  /** Already-EXPIRED discovery-launched executions whose ABANDONED had not been recorded (a no-op for any that already were). */
  backfilled: number;
}

export interface AskPendingReconciliationDependencies {
  findPending: (args: { since: Date; take: number }) => Promise<AskExecution[]>;
  findLapsed: (args: { since: Date; take: number }) => Promise<AskExecution[]>;
  expire: (execution: AskExecution) => Promise<Pick<AskExecution, 'status'>>;
  recordAbandoned: (executionId: string) => Promise<unknown[]>;
}

const defaultDependencies: AskPendingReconciliationDependencies = {
  findPending: ({ since, take }) => prisma.askExecution.findMany({ where: { status: { in: INTERACTIVE_ASK_STATUSES }, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' }, take }),
  findLapsed: ({ since, take }) => prisma.askExecution.findMany({ where: { status: 'EXPIRED', reasonCode: { in: TIME_EXPIRY_REASONS }, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' }, take }),
  expire: (execution) => expirePendingInteraction(execution),
  recordAbandoned: (executionId) => recordAskCapabilityLifecycle(executionId, 'EXPIRED'),
};

export async function reconcileExpiredDiscoveryProposals(
  options: { now?: Date; batchSize?: number } = {},
  dependencies: Partial<AskPendingReconciliationDependencies> = {},
): Promise<AskPendingReconciliationResult> {
  const deps = { ...defaultDependencies, ...dependencies };
  const now = options.now ?? new Date();
  const take = Math.max(1, Math.min(options.batchSize ?? 200, 1_000));
  const since = new Date(now.getTime() - ASK_PENDING_RECONCILIATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const pending = await deps.findPending({ since, take: take * 5 });
  let expired = 0;
  for (const execution of pending) {
    if (expired >= take) break;
    if (!hasDiscoveryClaim(execution)) continue;
    const expiresAt = pendingInteractionExpiresAt(execution);
    if (!expiresAt || expiresAt > now) continue;
    // The same transition the lazy path performs; it records the EXPIRED event and the ABANDONED lifecycle event itself.
    const result = await deps.expire(execution);
    if (result.status === 'EXPIRED') expired += 1;
  }

  const lapsed = await deps.findLapsed({ since, take: take * 5 });
  let backfilled = 0;
  for (const execution of lapsed) {
    if (backfilled >= take) break;
    if (!hasDiscoveryClaim(execution)) continue;
    backfilled += (await deps.recordAbandoned(execution.id)).length;
  }
  return { expired, backfilled };
}
