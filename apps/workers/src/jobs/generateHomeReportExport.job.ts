import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { HomeReportExportStatus } from '@prisma/client';
import { uploadPdfBuffer } from '../../../backend/src/services/storage/reportStorage';
import { renderHomeReportPackPdf } from '../../../backend/src/services/pdf/renderHomeReportPackPdf';
import {
  buildAuthoritativeReportSnapshot,
  checkReportWorkerContext,
} from '../../../backend/src/services/planningContext/reportSnapshot';
import { deleteObject } from '../storage/deleteObject';

function sha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function generateHomeReportExportJob(exportId: string) {
  const exp = await prisma.homeReportExport.findUnique({
    where: { id: exportId },
  });

  if (!exp) return;

  // ✅ ADD THIS FIRST
  if (exp.status === HomeReportExportStatus.DELETED) {
    return;
  }

  // Existing guard (keep it)
  if (exp.status !== HomeReportExportStatus.PENDING) {
    return;
  }

  await prisma.homeReportExport.update({
    where: { id: exportId },
      data: {
        status: HomeReportExportStatus.GENERATING,
        startedAt: new Date(),
      },
  });

  await prisma.homeReportExportEvent.create({
    data: {
      reportId: exportId,
      type: 'GENERATION_STARTED',
    },
  });

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

    const uploaded = await uploadPdfBuffer({
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

    await prisma.homeReportExport.update({
      where: { id: exportId },
      data: {
        status: HomeReportExportStatus.READY,
        completedAt: new Date(),
        snapshot,
        contextVersion: snapshot.meta.contextVersion,
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
      },
    });

    await prisma.homeReportExportEvent.create({
      data: {
        reportId: exportId,
        type: 'GENERATED',
        meta: {
          fileName,
          checksum,
          bucket: uploaded.bucket,
          key: uploaded.key,
        },
      },
    });
  } catch (err: any) {
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
