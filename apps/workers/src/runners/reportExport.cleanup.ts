import { prisma } from '../lib/prisma';
import { deleteObject } from '../storage/deleteObject';

const CLEAN_INTERVAL_MS = Number(process.env.REPORT_EXPORT_CLEAN_MS || 60_000);

export async function runReportExportCleanup() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const now = new Date();

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
          console.error('[cleanup] failed for export', exp.id, e);
        }
      }
    } catch (e) {
      console.error('[reportExportCleanup] error:', e);
    }

    await new Promise((r) => setTimeout(r, CLEAN_INTERVAL_MS));
  }
}
