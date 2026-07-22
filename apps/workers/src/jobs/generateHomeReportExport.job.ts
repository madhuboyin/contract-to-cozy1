import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { HomeReportExportStatus } from '@prisma/client';
import { uploadPdfBuffer } from '@worker-shared/services/storage/reportStorage';
import { renderHomeReportPackPdf } from '@worker-shared/services/pdf/renderHomeReportPackPdf';
import {
  buildAuthoritativeReportSnapshot,
  checkReportWorkerContext,
} from '@worker-shared/services/planningContext/reportSnapshot';
import { deleteObject } from '../storage/deleteObject';

function sha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function generateHomeReportExportJob(exportId: string) {
  const exp = await prisma.homeReportExport.findUnique({
    where: { id: exportId },
  });

  if (!exp) return;
  if (exp.status !== HomeReportExportStatus.PENDING) {
    return;
  }

  // Atomic claim (W3/exports — "safe claim ownership"): the poller does a
  // plain findMany + this job's own findUnique/update, with no guard against
  // two overlapping poll ticks (or two worker replicas) both reading PENDING
  // before either flips the row to GENERATING — both would generate and
  // upload, and whichever terminal update writes last wins, silently
  // orphaning the other's S3 object. The WHERE-guarded updateMany only
  // succeeds (count === 1) for whichever caller gets there first.
  const claim = await prisma.homeReportExport.updateMany({
    where: { id: exportId, status: HomeReportExportStatus.PENDING },
    data: {
      status: HomeReportExportStatus.GENERATING,
      startedAt: new Date(),
    },
  });
  if (claim.count !== 1) {
    return;
  }

  await prisma.homeReportExportEvent.create({
    data: {
      reportId: exportId,
      type: 'GENERATION_STARTED',
    },
  });

  // Cleanup-on-terminal-failure (W3/exports — "object cleanup"): tracks the
  // just-uploaded object only until the READY update that persists its key
  // actually commits. If anything after the upload throws — including the
  // READY update itself — nothing in the DB references the object yet, so
  // it must be deleted here or it's orphaned forever (S3 cost leak, never
  // reachable by the expiry-cleanup runner since that runner only finds
  // rows that already have a storageKey).
  let uploaded: { bucket: string; key: string } | undefined;

  try {
    // Recheck current applicability with the same policy the backend uses
    // before generating anything (workers act for the property owner).
    const contextCheck = await checkReportWorkerContext(exp.propertyId);
    if (!contextCheck.allowed || !contextCheck.userId) {
      await prisma.homeReportExport.update({
        where: { id: exportId },
        data: {
          status: HomeReportExportStatus.FAILED,
          completedAt: new Date(),
          errorMessage: `PROPERTY_CONTEXT_RECHECK_BLOCKED:${contextCheck.reasonCodes.join(',')}`,
        },
      });
      return;
    }

    const snapshot = await buildAuthoritativeReportSnapshot({
      userId: contextCheck.userId,
      propertyId: exp.propertyId,
      sections: exp.sections ?? undefined,
    });

    const propertyLabel = [snapshot.property.addressLine1, snapshot.property.city, snapshot.property.state]
      .filter(Boolean)
      .join(', ') || 'Home Report';

    const pdfBuffer = await renderHomeReportPackPdf(snapshot, {
      generatedAtIso: snapshot.meta.generatedAt,
      propertyLabel,
    });

    const checksum = sha256(pdfBuffer);
    const fileName = `home-report-${exp.propertyId}-${new Date().toISOString().slice(0, 10)}.pdf`;

    uploaded = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      checksumSha256: checksum,
      propertyId: exp.propertyId,
      userId: exp.userId,
    });

    // ⚠️ Optional extra safety: re-check before marking READY
    const latest = await prisma.homeReportExport.findUnique({
      where: { id: exportId },
    });

    if (!latest || latest.status === HomeReportExportStatus.DELETED) {
      // Best-effort cleanup if it was deleted mid-generation
      try {
        await deleteObject(uploaded.bucket, uploaded.key);
      } catch {}
      return;
    }

    const { bucket, key } = uploaded;

    await prisma.homeReportExport.update({
      where: { id: exportId },
      data: {
        status: HomeReportExportStatus.READY,
        completedAt: new Date(),
        snapshot: snapshot as any,
        contextVersion: snapshot.meta.contextVersion,
        storageBucket: bucket,
        storageKey: key,
      },
    });
    // READY committed with the storage key persisted — the row is now the
    // object's reference. A later failure (e.g. the event-log insert below)
    // must not delete a properly-referenced object.
    uploaded = undefined;

    await prisma.homeReportExportEvent.create({
      data: {
        reportId: exportId,
        type: 'GENERATED',
        meta: {
          fileName,
          checksum,
          bucket,
          key,
        },
      },
    });
  } catch (err: any) {
    if (uploaded) {
      try {
        await deleteObject(uploaded.bucket, uploaded.key);
      } catch {}
    }

    // ❗ If deleted mid-generation, do NOT overwrite status to FAILED
    const latest = await prisma.homeReportExport.findUnique({
      where: { id: exportId },
    });

    if (!latest || latest.status === HomeReportExportStatus.DELETED) {
      return;
    }

    await prisma.homeReportExport.update({
      where: { id: exportId },
      data: {
        status: HomeReportExportStatus.FAILED,
        completedAt: new Date(),
        errorMessage: (err?.message || 'Unknown error').slice(0, 1000),
      },
    });

    await prisma.homeReportExportEvent.create({
      data: {
        reportId: exportId,
        type: 'FAILED',
        meta: { message: err?.message },
      },
    });

    throw err;
  }
}
