// apps/workers/src/runners/homeReportExport.poller.ts
import { prisma } from '../lib/prisma';
import { generateHomeReportExportJob } from '../jobs/generateHomeReportExport.job';
import { logger } from '../lib/logger';

const POLL_INTERVAL_MS = Number(process.env.REPORT_EXPORT_POLL_MS || 10_000);
const BATCH_SIZE = Number(process.env.REPORT_EXPORT_BATCH_SIZE || 3);

// W5 item 7 (graceful shutdown): this loop previously had no stop
// mechanism at all — a SIGTERM would abandon it mid-loop with no chance
// to finish the current batch or exit the process cleanly.
let stopped = false;
export function stopHomeReportExportPoller(): void {
  stopped = true;
}

export async function runHomeReportExportPoller() {
  while (!stopped) {
    try {
      const pending = await prisma.homeReportExport.findMany({
        where: { status: 'PENDING' },
        orderBy: { requestedAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const exp of pending) {
        // best-effort; job will re-check status
        await generateHomeReportExportJob(exp.id);
      }
    } catch (e) {
      // keep polling even if one batch fails
      logger.error({ err: e }, '[homeReportExportPoller] error');
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
