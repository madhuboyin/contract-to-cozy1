// apps/workers/src/jobs/cleanupInventoryDrafts.job.ts
import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface CleanupInventoryDraftsDeps {
  prisma: Pick<typeof prisma, 'inventoryDraftItem'>;
  logger: AppLogger;
}

const defaultDeps: CleanupInventoryDraftsDeps = { prisma, logger };

/**
 * Deletes Inventory OCR drafts that were never confirmed and are older than TTL.
 *
 * Default TTL: 7 days (configurable via INVENTORY_DRAFT_TTL_DAYS)
 * Only deletes status = DRAFT (never touches CONFIRMED/DISMISSED)
 */
export async function cleanupInventoryDraftsJob(deps: CleanupInventoryDraftsDeps = defaultDeps) {
  const { prisma, logger } = deps;
  const ttlDays = Number(process.env.INVENTORY_DRAFT_TTL_DAYS || 7);

  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    logger.warn(
      `[INVENTORY-DRAFT-CLEANUP] Invalid INVENTORY_DRAFT_TTL_DAYS="${process.env.INVENTORY_DRAFT_TTL_DAYS}". Using default 7.`
    );
  }

  const effectiveTtlDays = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : 7;
  const cutoff = new Date(Date.now() - effectiveTtlDays * 24 * 60 * 60 * 1000);

  const result = await prisma.inventoryDraftItem.deleteMany({
    where: {
      status: 'DRAFT',
      updatedAt: { lt: cutoff },
    },
  });

  logger.info(
    `[INVENTORY-DRAFT-CLEANUP] Deleted ${result.count} DRAFT inventoryDraftItem rows older than ${effectiveTtlDays}d (cutoff=${cutoff.toISOString()})`
  );

  return { deletedCount: result.count, ttlDays: effectiveTtlDays, cutoff };
}
