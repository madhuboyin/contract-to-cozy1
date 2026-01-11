// apps/workers/src/jobs/cleanupInventoryDrafts.job.ts
import { prisma } from '../lib/prisma';

/**
 * Deletes Inventory OCR drafts that were never confirmed and are older than TTL.
 *
 * Default TTL: 7 days (configurable via INVENTORY_DRAFT_TTL_DAYS)
 * Only deletes status = DRAFT (never touches CONFIRMED/DISMISSED)
 */
export async function cleanupInventoryDraftsJob() {
  const ttlDays = Number(process.env.INVENTORY_DRAFT_TTL_DAYS || 7);

  // Guardrails
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    console.warn(
      `[INVENTORY-DRAFT-CLEANUP] Invalid INVENTORY_DRAFT_TTL_DAYS="${process.env.INVENTORY_DRAFT_TTL_DAYS}". Using default 7.`
    );
  }

  const effectiveTtlDays = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : 7;
  const cutoff = new Date(Date.now() - effectiveTtlDays * 24 * 60 * 60 * 1000);

  // Your backend draft service uses prisma.inventoryDraftItem (confirmed by the uploaded file)
  const result = await prisma.inventoryDraftItem.deleteMany({
    where: {
      status: 'DRAFT',
      updatedAt: { lt: cutoff },
    },
  });

  console.log(
    `[INVENTORY-DRAFT-CLEANUP] Deleted ${result.count} DRAFT inventoryDraftItem rows older than ${effectiveTtlDays}d (cutoff=${cutoff.toISOString()})`
  );

  return { deletedCount: result.count, ttlDays: effectiveTtlDays, cutoff };
}
