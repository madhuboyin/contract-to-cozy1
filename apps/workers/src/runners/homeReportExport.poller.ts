// apps/workers/src/runners/homeReportExport.poller.ts
import { prisma } from '../lib/prisma';
import { generateHomeReportExportJob } from '../jobs/generateHomeReportExport.job';

const POLL_INTERVAL_MS = Number(process.env.REPORT_EXPORT_POLL_MS || 10_000);
const BATCH_SIZE = Number(process.env.REPORT_EXPORT_BATCH_SIZE || 3);

export async function runHomeReportExportPoller() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
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
      console.error('[homeReportExportPoller] error:', e);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
