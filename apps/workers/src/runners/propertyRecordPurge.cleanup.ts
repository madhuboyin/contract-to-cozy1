// apps/workers/src/runners/propertyRecordPurge.cleanup.ts
//
// Advances Home Records trash (PropertyRecordPurgeJob) to permanent deletion.
// trash() in homeRecords.service.ts queues a PENDING job with a 30-day (or
// retention-policy) eligibleAt; restore() flips any pending job to BLOCKED.
// This tick promotes elapsed PENDING jobs to ELIGIBLE and then purges them —
// deleting every version's stored object BEFORE the database row, so a live
// version never points at a missing object.
import { prisma } from '../lib/prisma';
import { deleteObject } from '../storage/deleteObject';
import { logger } from '../lib/logger';
import { removeQuoteSourceContent } from '@worker-shared/services/quoteSourcePurge';
import { removePropertyTaxSourceContent } from '@worker-shared/services/propertyTax/propertyTaxSourcePurge';

const CLEAN_INTERVAL_MS = Number(process.env.PROPERTY_RECORD_PURGE_CLEAN_MS || 60_000);

export async function propertyRecordPurgeTick(): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return;

  const now = new Date();

  await prisma.propertyRecordPurgeJob.updateMany({
    where: { state: 'PENDING', eligibleAt: { lte: now } },
    data: { state: 'ELIGIBLE' },
  });

  const eligible = await prisma.propertyRecordPurgeJob.findMany({
    where: { state: 'ELIGIBLE' },
    orderBy: { requestedAt: 'asc' },
    take: 10,
    include: {
      record: {
        include: { versions: { select: { storageKey: true } } },
      },
    },
  });

  for (const job of eligible) {
    if (job.record.lifecycleStatus !== 'TRASHED') {
      // restore() already resets pending jobs to BLOCKED — this only guards
      // against a race between eligibility and processing.
      continue;
    }
    if (job.record.legalHoldReason) {
      await prisma.propertyRecordPurgeJob.update({
        where: { id: job.id },
        data: { state: 'BLOCKED', blockedReason: `Legal hold: ${job.record.legalHoldReason}` },
      });
      continue;
    }

    try {
      await prisma.propertyRecordPurgeJob.update({
        where: { id: job.id },
        data: { state: 'PROCESSING' },
      });

      for (const version of job.record.versions) {
        await deleteObject(bucket, version.storageKey);
      }

      // Quotes imported from this record keep what a person confirmed or corrected and lose what was only extracted (Quote Comparison import
      // design §3.5, D-Q7). It runs in the same transaction as the delete, so a quote is never left holding extracted content of a purged source.
      // Cascades versions, links, and this purge job row — objects for every
      // version are already gone by this point.
      await prisma.$transaction(async (tx) => {
        await removeQuoteSourceContent(tx, job.recordId);
        // Confirmed property tax values stay and are marked source-removed (owner ruling D-T5); it runs before the delete, which nulls their references.
        await removePropertyTaxSourceContent(tx, job.recordId);
        await tx.propertyRecord.delete({ where: { id: job.recordId } });
      });

      logger.info(
        { recordId: job.recordId, versionCount: job.record.versions.length },
        '[property-record-purge] purged trashed record and its stored objects',
      );
    } catch (e) {
      logger.error({ err: e, recordId: job.recordId }, '[property-record-purge] purge failed');
      await prisma.propertyRecordPurgeJob.update({
        where: { id: job.id },
        data: { state: 'FAILED', lastError: e instanceof Error ? e.message : String(e) },
      }).catch(() => undefined);
    }
  }
}

let stopped = false;
export function stopPropertyRecordPurge(): void {
  stopped = true;
}

export async function runPropertyRecordPurge() {
  while (!stopped) {
    try {
      await propertyRecordPurgeTick();
    } catch (e) {
      logger.error({ err: e }, '[propertyRecordPurge] error');
    }

    await new Promise((r) => setTimeout(r, CLEAN_INTERVAL_MS));
  }
}
