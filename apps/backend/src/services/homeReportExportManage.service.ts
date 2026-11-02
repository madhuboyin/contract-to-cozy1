// Making a fresh copy of a home-record export, and deleting one: the one place the rules live, shared by the routes
// (POST .../regenerate, DELETE /reports/exports/:exportId) and the Ask command (HOME_RECORD_EXPORT_SHARE, its Make a fresh copy and Delete
// kinds) so a conversation can never do what the route would refuse.
import type { HomeReportExport } from '@prisma/client';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getS3Client } from './storage/s3Client';
import { createHomeReportExportRecord, type CreateHomeReportExportResult } from './homeReportExportCreate.service';
import { loadOwnedExport, type ShareRuleFailure } from './homeReportExportShare.service';

/** The sections the earlier export carried; null when its record has no readable list (the pack's default then applies). */
const includedOf = (sections: unknown): string[] | null => {
  const included = sections && typeof sections === 'object' ? (sections as { included?: unknown }).included : null;
  return Array.isArray(included) && included.every((id) => typeof id === 'string') && included.length ? (included as string[]) : null;
};

/**
 * A new export with the same sections, prepared by the worker; the earlier export stays. The section choice is validated again for the
 * caller's role, one export is prepared at a time, and the new one is kept for 30 days from now (not until the earlier one's expiry).
 */
export async function regenerateHomeReportExportRecord(input: { exportId: string; userId: string; locale?: string }): Promise<ShareRuleFailure | CreateHomeReportExportResult> {
  const loaded = await loadOwnedExport(input.exportId, input.userId);
  if (loaded.failure) return loaded.failure;
  const exp = loaded.exp as HomeReportExport;
  return createHomeReportExportRecord({
    userId: input.userId, propertyId: exp.propertyId, type: exp.type, sections: includedOf(exp.sections) ?? undefined,
    locale: input.locale ?? exp.locale ?? undefined, regeneratedFromId: exp.id,
  });
}

/** Removes the stored file (best effort), marks the export deleted and stops any share link at once. Deleting a deleted export succeeds. */
export async function deleteHomeReportExportRecord(input: { exportId: string; userId: string }): Promise<Exclude<ShareRuleFailure, { kind: 'DELETED' }> | { kind: 'DELETED' }> {
  const loaded = await loadOwnedExport(input.exportId, input.userId);
  if (loaded.failure) return loaded.failure.kind === 'DELETED' ? { kind: 'DELETED' } : loaded.failure;
  const exp = loaded.exp as HomeReportExport;
  if (exp.storageBucket && exp.storageKey) {
    try {
      await getS3Client().send(new DeleteObjectCommand({ Bucket: exp.storageBucket, Key: exp.storageKey }));
    } catch (err) {
      // Never fail a deletion because of storage cleanup.
      logger.warn({ err }, '[deleteHomeReportExportRecord] storage delete failed');
    }
  }
  const now = new Date();
  await prisma.homeReportExport.update({
    where: { id: exp.id },
    data: { status: 'DELETED', deletedAt: now, deletedByUserId: input.userId, shareRevokedAt: now, shareExpiresAt: now },
  });
  await prisma.homeReportExportEvent.create({ data: { reportId: exp.id, type: 'DELETED', meta: { by: 'OWNER' } } });
  return { kind: 'DELETED' };
}
