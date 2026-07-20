// apps/workers/src/runners/materialSpecExport.cleanup.ts
//
// W3 (exports — "exact-record expiration" + "bounded retries"):
// MaterialSpecExport rows get an expiresAt at creation (7 days,
// materialSpec.service.ts#requestExport) but nothing ever enforced it —
// unlike reportExport.cleanup.ts, which does this for HomeReportExport.
// The S3 object and DB row lived forever regardless of expiresAt: a pure
// storage-cost leak with zero enforcement. This mirrors that runner's
// pattern for MaterialSpecExport, plus the same stale-GENERATING reclaim
// (a worker crash mid-generation left a row stuck in GENERATING forever
// with no automatic path to FAILED).

import { prisma } from '../lib/prisma';
import { deleteObject } from '../storage/deleteObject';
import { logger } from '../lib/logger';

const CLEAN_INTERVAL_MS = Number(process.env.MATERIAL_SPEC_EXPORT_CLEAN_MS || 60_000);
// No dedicated startedAt column on MaterialSpecExport — updatedAt is a safe
// proxy here since GENERATING is only ever set once (by the atomic claim)
// and nothing else updates the row while it's in that state.
const STALE_GENERATING_MS = Number(process.env.MATERIAL_SPEC_EXPORT_STALE_GENERATING_MS || 30 * 60 * 1000);

export async function materialSpecExportCleanupTick(): Promise<void> {
  const now = new Date();

  const staleGenerating = await prisma.materialSpecExport.findMany({
    where: { status: 'GENERATING', updatedAt: { lte: new Date(now.getTime() - STALE_GENERATING_MS) } },
    take: 25,
  });
  for (const exp of staleGenerating) {
    try {
      await prisma.materialSpecExport.update({
        where: { id: exp.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Generation timed out (worker likely restarted mid-run) — please try again.',
        },
      });
    } catch (e) {
      logger.error({ err: e, exportId: exp.id }, '[materialSpecExportCleanup] failed to reclaim stale GENERATING export');
    }
  }

  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    logger.warn('[materialSpecExportCleanup] S3_BUCKET not set — skipping expiry sweep this tick');
    return;
  }

  const expired = await prisma.materialSpecExport.findMany({
    where: {
      status: 'COMPLETED',
      expiresAt: { lte: now },
      fileKey: { not: null },
    },
    orderBy: { expiresAt: 'asc' },
    take: 25,
  });

  for (const exp of expired) {
    try {
      await deleteObject(bucket, exp.fileKey!);

      await prisma.materialSpecExport.update({
        where: { id: exp.id },
        data: {
          status: 'EXPIRED',
          fileKey: null,
          fileUrl: null,
        },
      });
    } catch (e) {
      logger.error({ err: e, exportId: exp.id }, '[materialSpecExportCleanup] failed to expire export');
    }
  }
}

export async function runMaterialSpecExportCleanup() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await materialSpecExportCleanupTick();
    } catch (e) {
      logger.error({ err: e }, '[materialSpecExportCleanup] error');
    }

    await new Promise((r) => setTimeout(r, CLEAN_INTERVAL_MS));
  }
}
