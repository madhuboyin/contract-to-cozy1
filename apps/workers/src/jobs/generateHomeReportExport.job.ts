import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { uploadPdfBuffer } from '../../../backend/src/services/storage/reportStorage';
import { renderHomeReportPackPdf } from '../../../backend/src/services/pdf/renderHomeReportPackPdf';

function sha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function buildReportSnapshot(propertyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      inventoryRooms: true,
      inventoryItems: { include: { room: true, documents: true } },
      insurancePolicies: { include: { documents: true } },
      warranties: { include: { documents: true } },
      maintenanceTasks: true,
    },
  });

  if (!property) throw new Error('Property not found');

  return {
    meta: { generatedAt: new Date().toISOString(), propertyId, templateVersion: 1, dataVersion: 1 },
    property,
  };
}

export async function generateHomeReportExportJob(exportId: string) {
  const exp = await prisma.homeReportExport.findUnique({ where: { id: exportId } });
  if (!exp) return;

  if (exp.status !== 'PENDING') return;

  await prisma.homeReportExport.update({
    where: { id: exportId },
    data: { status: 'GENERATING', startedAt: new Date() },
  });

  await prisma.homeReportExportEvent.create({
    data: { reportId: exportId, type: 'GENERATION_STARTED' },
  });

  try {
    const snapshot = await buildReportSnapshot(exp.propertyId);
    const pdfBuffer = await renderHomeReportPackPdf(snapshot);

    const checksum = sha256(pdfBuffer);
    const fileName = `home-report-${exp.propertyId}-${new Date().toISOString().slice(0, 10)}.pdf`;

    const uploaded = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      checksumSha256: checksum,
      propertyId: exp.propertyId,
      userId: exp.userId,
    });

    await prisma.homeReportExport.update({
      where: { id: exportId },
      data: {
        status: 'READY',
        completedAt: new Date(),
        snapshot,
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
      },
    });

    await prisma.homeReportExportEvent.create({
      data: {
        reportId: exportId,
        type: 'GENERATED',
        meta: { fileName, checksum, bucket: uploaded.bucket, key: uploaded.key },
      },
    });
  } catch (err: any) {
    await prisma.homeReportExport.update({
      where: { id: exportId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: (err?.message || 'Unknown error').slice(0, 1000),
      },
    });

    await prisma.homeReportExportEvent.create({
      data: { reportId: exportId, type: 'FAILED', meta: { message: err?.message } },
    });

    throw err;
  }
}
