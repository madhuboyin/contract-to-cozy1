// apps/backend/src/services/homeReportExport.service.ts
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { renderHomeReportPackPdf } from './pdf/renderHomeReportPackPdf';
import { uploadPdfBuffer } from './storage/reportStorage';
import { presignGetObject } from './storage/presign';
import { buildAuthoritativeReportSnapshot } from './planningContext/reportSnapshot';
import { buildRedactedReportSnapshot } from './planningContext/redaction';
import { getPlanningContextEnvelope } from './planningContext/context';

type CreateExportArgs = {
  userId: string;
  propertyId: string;
  type: 'HOME_SUMMARY' | 'INVENTORY' | 'MAINTENANCE_HISTORY' | 'COVERAGE_SNAPSHOT' | 'HOME_REPORT_PACK';
  sections?: any;
  locale?: string;
  timezone?: string;
};

export function buildShareToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function sha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function createExportAndGeneratePdf(args: CreateExportArgs) {
  const { userId, propertyId, type, sections, locale, timezone } = args;

  // 1) create export row
  const exp = await prisma.homeReportExport.create({
    data: {
      userId,
      propertyId,
      type,
      status: 'PENDING',
      sections: sections ?? null,
      locale: locale ?? 'en-US',
      timezone: timezone ?? 'America/New_York',
    },
  });

  await prisma.homeReportExportEvent.create({
    data: { reportId: exp.id, type: 'CREATED' },
  });

  // 2) mark generating
  await prisma.homeReportExport.update({
    where: { id: exp.id },
    data: { status: 'GENERATING', startedAt: new Date() },
  });

  await prisma.homeReportExportEvent.create({
    data: { reportId: exp.id, type: 'GENERATION_STARTED' },
  });

  try {
    // 3) build snapshot DTO (this is what renders + what we store)
    const snapshot = await buildAuthoritativeReportSnapshot({ userId, propertyId, sections });

    // 4) render PDF buffer
    const pdfBuffer = await renderHomeReportPackPdf(snapshot);

    // 5) upload to storage (S3/R2/etc)
    const checksum = sha256(pdfBuffer);
    const fileName = `home-report-${propertyId}-${new Date().toISOString().slice(0, 10)}.pdf`;

    const uploaded = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      checksumSha256: checksum,
      propertyId,
      userId,
    });

    // Generate presigned URL for document record
    const fileUrl = await presignGetObject({
      bucket: uploaded.bucket,
      key: uploaded.key,
      expiresInSeconds: 7 * 24 * 60 * 60, // 7 days
    });

    // 6) create Document row
    const doc = await prisma.document.create({
      data: {
        uploadedBy: userId,
        propertyId,
        type: 'HOME_REPORT_PDF',
        name: fileName,
        description: `Generated home report (${type})`,
        fileUrl,
        fileSize: uploaded.fileSizeBytes,
        mimeType: 'application/pdf',
      },
    });

    // 7) finalize export
    await prisma.homeReportExport.update({
      where: { id: exp.id },
      data: {
        status: 'READY',
        completedAt: new Date(),
        documentId: doc.id,
        snapshot: snapshot as any,
        contextVersion: snapshot.meta.contextVersion,
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
      },
    });

    await prisma.homeReportExportEvent.create({
      data: { reportId: exp.id, type: 'GENERATED', meta: { fileName, checksum } },
    });

    return {
      exportId: exp.id,
      status: 'READY',
      documentId: doc.id,
      fileUrl,
    };
  } catch (err: any) {
    await prisma.homeReportExport.update({
      where: { id: exp.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: err?.message?.slice(0, 1000) || 'Unknown error',
      },
    });

    await prisma.homeReportExportEvent.create({
      data: { reportId: exp.id, type: 'FAILED', meta: { message: err?.message } },
    });

    throw err;
  }
}

/**
 * Prepare the redacted share artifacts for an export. Share-token consumers
 * only ever receive the redacted projection; the full snapshot and full PDF
 * stay behind owner authentication. Returns the updated export row.
 */
export async function prepareShareArtifacts(exportId: string) {
  const exp = await prisma.homeReportExport.findUnique({ where: { id: exportId } });
  if (!exp) throw new Error('Report export not found');
  if (exp.status !== 'READY' || !exp.snapshot) {
    throw new Error('Report is not ready to share');
  }

  // Authoritative shared-report decision: sharing is refused when the
  // redacted-projection context is NOT_APPLICABLE for this property.
  const sharedProjection = await getPlanningContextEnvelope(exp.propertyId, exp.userId, 'SHARED_REPORT');
  if (sharedProjection.decision.status === 'NOT_APPLICABLE') {
    throw new Error('Sharing is not applicable for this property context');
  }

  const redactedSnapshot = buildRedactedReportSnapshot(exp.snapshot as Record<string, unknown>);
  const pdfBuffer = await renderHomeReportPackPdf(redactedSnapshot, {
    propertyLabel: [redactedSnapshot.property.city, redactedSnapshot.property.state]
      .filter(Boolean)
      .join(', ') || 'Shared Home Report',
  });

  const checksum = sha256(pdfBuffer);
  const fileName = `shared-home-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  const uploaded = await uploadPdfBuffer({
    buffer: pdfBuffer,
    fileName,
    checksumSha256: checksum,
    propertyId: exp.propertyId,
    userId: exp.userId,
  });

  const updated = await prisma.homeReportExport.update({
    where: { id: exportId },
    data: {
      redactedSnapshot: redactedSnapshot as object,
      shareStorageBucket: uploaded.bucket,
      shareStorageKey: uploaded.key,
    },
  });

  await prisma.homeReportExportEvent.create({
    data: {
      reportId: exportId,
      type: 'SHARE_ARTIFACTS_PREPARED',
      meta: {
        checksum,
        decisionStatus: sharedProjection.decision.status,
        decisionReasonCodes: sharedProjection.decision.reasonCodes,
      },
    },
  });

  return updated;
}
