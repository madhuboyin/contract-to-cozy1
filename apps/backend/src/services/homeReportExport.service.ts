// apps/backend/src/services/homeReportExport.service.ts
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { renderHomeReportPackPdf } from './pdf/renderHomeReportPackPdf';
import { uploadPdfBuffer } from './storage/reportStorage';
import { presignGetObject } from './storage/presign';

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
    const snapshot = await buildReportSnapshot({ userId, propertyId, sections });

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
        snapshot,
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

async function buildReportSnapshot(args: { userId: string; propertyId: string; sections?: any }) {
  const { propertyId } = args;

  // Pull the key report data in one place.
  // Keep it stable (DTO) so template changes don’t break old snapshots.
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      inventoryRooms: true,
      inventoryItems: {
        include: { room: true, documents: true },
      },
      insurancePolicies: {
        include: { documents: true },
      },
      warranties: {
        include: { documents: true },
      },
      maintenanceTasks: true,
    },
  });

  if (!property) throw new Error('Property not found');

  // Minimal snapshot DTO. You can enrich later without schema changes.
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      propertyId,
      templateVersion: 1,
      dataVersion: 1,
    },
    property: {
      id: property.id,
      nickname: (property as any).nickname ?? null,
      addressLine1: (property as any).addressLine1 ?? null,
      addressLine2: (property as any).addressLine2 ?? null,
      city: (property as any).city ?? null,
      state: (property as any).state ?? null,
      zipCode: (property as any).zipCode ?? null,
      propertyType: (property as any).propertyType ?? null,
      yearBuilt: (property as any).yearBuilt ?? null,
      livingAreaSqft: (property as any).livingAreaSqft ?? null,
    },
    inventory: {
      rooms: property.inventoryRooms?.map((r: any) => ({
        id: r.id,
        name: r.name,
      })) ?? [],
      items: property.inventoryItems?.map((i: any) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        condition: i.condition,
        brand: i.brand ?? null,
        modelNumber: i.modelNumber ?? null,
        serialNumber: i.serialNumber ?? null,
        purchasedOn: i.purchasedOn ?? null,
        purchaseCostCents: i.purchaseCostCents ?? null,
        replacementCostCents: i.replacementCostCents ?? null,
        room: i.room ? { id: i.room.id, name: i.room.name } : null,
        documents: (i.documents ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          fileUrl: d.fileUrl,
        })),
      })) ?? [],
    },
    maintenance: {
      tasks: property.maintenanceTasks?.map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        riskLevel: t.riskLevel ?? null,
        frequency: t.frequency ?? null,
        nextDueDate: t.nextDueDate ?? null,
        lastCompletedDate: t.lastCompletedDate ?? null,
        estimatedCost: t.estimatedCost ?? null,
        actualCost: t.actualCost ?? null,
        assetType: t.assetType ?? null,
        source: t.source,
      })) ?? [],
    },
    coverage: {
      insurancePolicies: property.insurancePolicies?.map((p: any) => ({
        id: p.id,
        providerName: p.providerName,
        policyNumber: p.policyNumber,
        startDate: p.startDate,
        expiryDate: p.expiryDate,
        premium: p.premium ?? null,
        coverageAmount: p.coverageAmount ?? null,
        documents: (p.documents ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          fileUrl: d.fileUrl,
        })),
      })) ?? [],
      warranties: property.warranties?.map((w: any) => ({
        id: w.id,
        providerName: w.providerName,
        policyNumber: w.policyNumber,
        startDate: w.startDate,
        expiryDate: w.expiryDate,
        coverageDetails: w.coverageDetails ?? null,
        documents: (w.documents ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          fileUrl: d.fileUrl,
        })),
      })) ?? [],
    },
  };
}
