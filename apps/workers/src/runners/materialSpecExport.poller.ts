import { prisma } from '../lib/prisma';
import { generateMaterialSpecExportJob } from '../jobs/generateMaterialSpecExport.job';
import { logger } from '../lib/logger';

const POLL_INTERVAL_MS = Number(process.env.MATERIAL_SPEC_EXPORT_POLL_MS || 10_000);
const BATCH_SIZE = Number(process.env.MATERIAL_SPEC_EXPORT_BATCH_SIZE || 3);

// W5 item 7 (graceful shutdown): see homeReportExport.poller.ts's identical note.
let stopped = false;
export function stopMaterialSpecExportPoller(): void {
  stopped = true;
}

export async function runMaterialSpecExportPoller() {
  while (!stopped) {
    try {
      const pending = await prisma.materialSpecExport.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const exp of pending) {
        await generateMaterialSpecExportJob(exp.id);
      }
    } catch (e) {
      logger.error({ err: e }, '[materialSpecExportPoller] error');
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
