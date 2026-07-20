// apps/workers/src/runners/claimFollowUpDue.poller.ts
import { prisma } from '../lib/prisma';
import { DomainEventsService } from '../../../backend/src/services/domainEvents/domainEvents.service';
import { logger } from '../lib/logger';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Extracted so a single tick can be unit-tested directly instead of only
// through the never-resolving while(true) loop below — same pattern
// already used for reportExport.cleanup.ts/materialSpecExport.cleanup.ts.
export async function claimFollowUpDueTick(batchSize: number): Promise<{ emitted: number; failed: number }> {
  const now = new Date();

  const claims = await prisma.claim.findMany({
    where: {
      nextFollowUpAt: { not: null, lte: now },
      status: { notIn: ['CLOSED', 'DRAFT'] as any },
    },
    select: {
      id: true,
      propertyId: true,
      createdBy: true,
      nextFollowUpAt: true,
      status: true,
      providerName: true,
      claimNumber: true,
    },
    orderBy: { nextFollowUpAt: 'asc' },
    take: batchSize,
  });

  if (claims.length === 0) return { emitted: 0, failed: 0 };

  let emitted = 0;
  let failed = 0;

  // Per-claim error isolation: one claim's emit failing must not delay
  // FOLLOW_UP_DUE events for every other due claim in this batch until the
  // next poll interval — self-heals eventually since nextFollowUpAt isn't
  // cleared, but there's no reason to wait a full interval for the rest.
  for (const c of claims) {
    const key = `claim:${c.id}:followup_due:${c.nextFollowUpAt?.toISOString()}`;

    try {
      await DomainEventsService.emit({
        type: 'FOLLOW_UP_DUE',
        propertyId: c.propertyId,
        userId: c.createdBy,
        idempotencyKey: key,
        payload: {
          claimId: c.id,
          propertyId: c.propertyId,
          userId: c.createdBy,
          nextFollowUpAt: c.nextFollowUpAt,
          status: c.status,
          providerName: c.providerName,
          claimNumber: c.claimNumber,
        },
      });
      emitted++;
    } catch (err) {
      failed++;
      logger.error({ err, claimId: c.id }, '[CLAIM-FOLLOWUP] emit failed for one claim');
    }
  }

  logger.info(`[CLAIM-FOLLOWUP] emitted=${emitted} failed=${failed}`);
  return { emitted, failed };
}

export function startClaimFollowUpDuePoller(opts?: { intervalMs?: number; batchSize?: number }) {
  const intervalMs = opts?.intervalMs ?? 60_000;
  const batchSize = opts?.batchSize ?? 50;

  let stopped = false;

  const loop = async () => {
    while (!stopped) {
      try {
        await claimFollowUpDueTick(batchSize);
      } catch (e: any) {
        logger.error({ err: e }, '[CLAIM-FOLLOWUP] poller error');
      }
      await sleep(intervalMs);
    }
  };

  void loop();
  logger.info(`[CLAIM-FOLLOWUP] poller started intervalMs=${intervalMs} batchSize=${batchSize}`);

  return () => {
    stopped = true;
  };
}
