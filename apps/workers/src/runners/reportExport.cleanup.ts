import { prisma } from '../lib/prisma';
import { deleteObject } from '../storage/deleteObject';
import { logger } from '../lib/logger';

const CLEAN_INTERVAL_MS = Number(process.env.REPORT_EXPORT_CLEAN_MS || 60_000);
// W3 (exports — "bounded retries"): if the worker process dies mid-generation
// (OOM kill, deploy restart) after a row is claimed into GENERATING but
// before the terminal update, nothing previously reclaimed it — it stayed
// stuck in GENERATING forever with no automatic path back to FAILED. There
// is no retry-to-PENDING here (that would risk re-running a generation that
// might legitimately still be in flight on a slow request); a stuck row is
// surfaced honestly as FAILED so the user sees a real state instead of an
// indefinite spinner and can re-request.
const STALE_GENERATING_MS = Number(process.env.REPORT_EXPORT_STALE_GENERATING_MS || 30 * 60 * 1000);

export async function reportExportCleanupTick(): Promise<void> {
  const now = new Date();

  const staleGenerating = await prisma.homeReportExport.findMany({
    where: { status: 'GENERATING', startedAt: { lte: new Date(now.getTime() - STALE_GENERATING_MS) } },
    take: 25,
  });
  for (const exp of staleGenerating) {
    try {
      await prisma.homeReportExport.update({
        where: { id: exp.id },
        data: {
          status: 'FAILED',
          completedAt: now,
          errorMessage: 'Generation timed out (worker likely restarted mid-run) — please try again.',
        },
      });
      await prisma.homeReportExportEvent.create({
        data: { reportId: exp.id, type: 'FAILED', meta: { reason: 'STALE_GENERATING_RECLAIMED' } },
      });
    } catch (e) {
      logger.error({ err: e, exportId: exp.id }, '[cleanup] failed to reclaim stale GENERATING export');
    }
  }

  const expired = await prisma.homeReportExport.findMany({
    where: {
      status: 'READY',
      expiresAt: { lte: now },
      storageBucket: { not: null },
      storageKey: { not: null },
    },
    orderBy: { expiresAt: 'asc' },
    take: 25,
  });

  for (const exp of expired) {
    try {
      await deleteObject(exp.storageBucket!, exp.storageKey!);

      await prisma.homeReportExport.update({
        where: { id: exp.id },
        data: {
          status: 'EXPIRED',
          storageBucket: null,
          storageKey: null,
        },
      });

      await prisma.homeReportExportEvent.create({
        data: { reportId: exp.id, type: 'EXPIRED' },
      });
    } catch (e) {
      logger.error({ err: e, exportId: exp.id }, '[cleanup] failed for export');
    }
  }
}

// W5 item 7 (graceful shutdown): see homeReportExport.poller.ts's identical note.
let stopped = false;
export function stopReportExportCleanup(): void {
  stopped = true;
}

export async function runReportExportCleanup() {
  while (!stopped) {
    try {
      await reportExportCleanupTick();
    } catch (e) {
      logger.error({ err: e }, '[reportExportCleanup] error');
    }

    await new Promise((r) => setTimeout(r, CLEAN_INTERVAL_MS));
  }
}
