// apps/workers/src/lib/domainEventClaimToken.ts
//
// Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §22, Stage 2's
// fourth-round correction). Built ahead of any real caller: Phase 3's
// extraction job is what first uses this, but Phase 2's own acceptance
// criterion requires proving retry/reject/persist-once safety before
// extraction exists.
//
// The problem this closes: processDomainEvents.job.ts's existing claim/lease
// loop (attempts: { increment: 1 }, leaseExpiresAt) already makes a crashed
// worker's event reclaimable by a later attempt. What it does NOT protect
// against is a worker that is merely SLOW, not crashed -- one still running
// past its own lease's expiry, after a second attempt has already reclaimed
// and is processing the same event concurrently. Without this check, the
// slow (first) attempt's eventual commit could persist a candidate set for
// an extraction the system has already moved on from -- a duplicate or
// stale write, not merely a delayed one.
//
// The fix: any transaction that persists what a claimed attempt produced
// (Phase 3: extraction candidates) must re-verify, inside that SAME
// transaction, that this attempt's claim token (the `attempts` value the
// row had immediately after this worker's own claim) still matches the
// row's current value. If a later attempt has since reclaimed the lease,
// `attempts` has moved on, the conditional update matches zero rows, and
// this function throws -- rolling back the whole transaction, including any
// candidate writes made earlier in the same callback, per Prisma's standard
// interactive-transaction behavior on an uncaught error.

import type { Prisma } from '@prisma/client';

export class DomainEventClaimLostError extends Error {
  readonly domainEventId: string;
  readonly claimedAttempts: number;

  constructor(domainEventId: string, claimedAttempts: number) {
    super(`DomainEvent ${domainEventId}'s claim token (attempts=${claimedAttempts}) no longer matches -- a later attempt has already reclaimed this lease.`);
    this.name = 'DomainEventClaimLostError';
    this.domainEventId = domainEventId;
    this.claimedAttempts = claimedAttempts;
  }
}

/**
 * Call once, early, inside the same `prisma.$transaction(async (tx) => ...)`
 * callback that persists a claimed attempt's durable output. `claimedAttempts`
 * is the `attempts` value the DomainEvent row had immediately after this
 * worker's own successful claim (processDomainEvents.job.ts's claim loop
 * does `attempts: { increment: 1 }`, so that value is the pre-claim `attempts`
 * plus one -- compute and hold it once, right after claiming, not by
 * re-reading the row later).
 *
 * Resolves (and touches processingStartedAt, so the update is a real write,
 * not a no-op the database could optimize away) if this attempt still owns
 * the claim. Throws DomainEventClaimLostError -- which the caller should let
 * propagate out of the transaction callback uncaught, so Prisma rolls the
 * whole transaction back -- if a later attempt has already reclaimed it.
 */
export async function verifyDomainEventClaimToken(
  tx: Prisma.TransactionClient,
  domainEventId: string,
  claimedAttempts: number,
): Promise<void> {
  const stillOwned = await tx.domainEvent.updateMany({
    where: { id: domainEventId, attempts: claimedAttempts },
    data: { processingStartedAt: new Date() },
  });
  if (stillOwned.count !== 1) {
    throw new DomainEventClaimLostError(domainEventId, claimedAttempts);
  }
}
