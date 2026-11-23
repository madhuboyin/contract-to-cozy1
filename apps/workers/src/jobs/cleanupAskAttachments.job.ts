// BICC-MM-010 / FRD D10: removes expired, failed and abandoned Ask chat attachments and every derivative. The rules and the sweep live in the backend
// (services/ask/attachments); this is only the scheduled entry point.
//
// FAIL CLOSED: the derived-copy storage for attachments does not exist yet (no upload path produces one). Until a storage adapter is supplied, this job reports every
// copy of any due attachment as NOT removed, so a row is never marked deleted while a copy might remain. With no attachments it does nothing.
import { sweepExpiredAttachments, type AttachmentDerivedStorage, type SweepResult } from '@worker-shared/services/ask/attachments/attachmentSweeper';
import { prismaAttachmentSweepStore } from '@worker-shared/services/ask/attachments/attachmentStore.prisma';
import { deletionPlan } from '@worker-shared/services/ask/attachments/attachmentLifecycle';
import { logger } from '../lib/logger';

export const NO_ATTACHMENT_STORAGE_YET: AttachmentDerivedStorage = {
  async deleteCopies() { return { failed: [...deletionPlan()] }; },
};

export async function cleanupAskAttachmentsJob(storage: AttachmentDerivedStorage = NO_ATTACHMENT_STORAGE_YET): Promise<SweepResult> {
  const result = await sweepExpiredAttachments({ store: prismaAttachmentSweepStore, storage });
  if (result.examined > 0) logger.info(`[ASK-ATTACHMENT-CLEANUP] examined ${result.examined}, ended ${result.ended}, retry later ${result.retryLater}`);
  if (result.retryLater > 0) logger.warn(`[ASK-ATTACHMENT-CLEANUP] ${result.retryLater} attachment(s) could not be fully removed and stay due for the next run`);
  return result;
}
