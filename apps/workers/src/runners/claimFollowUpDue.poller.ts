// apps/workers/src/runners/claimFollowUpDue.poller.ts
import { prisma } from '../lib/prisma';
import { DomainEventsService } from '../../../backend/src/services/domainEvents/domainEvents.service';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startClaimFollowUpDuePoller(opts?: { intervalMs?: number; batchSize?: number }) {
  const intervalMs = opts?.intervalMs ?? 60_000;
  const batchSize = opts?.batchSize ?? 50;

  let stopped = false;

  const tick = async () => {
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

    if (claims.length === 0) return;

    for (const c of claims) {
      const key = `claim:${c.id}:followup_due:${c.nextFollowUpAt?.toISOString()}`;

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
    }

    console.log(`[CLAIM-FOLLOWUP] emitted=${claims.length}`);
  };

  const loop = async () => {
    while (!stopped) {
      try {
        await tick();
      } catch (e: any) {
        console.error('[CLAIM-FOLLOWUP] poller error', e?.message || e);
      }
      await sleep(intervalMs);
    }
  };

  void loop();
  console.log(`[CLAIM-FOLLOWUP] poller started intervalMs=${intervalMs} batchSize=${batchSize}`);

  return () => {
    stopped = true;
  };
}
