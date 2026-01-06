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

  // Adjust field names below if your Property model differs (addressLine1 vs street1, zip vs zipCode, etc.)
  const addressLine1 = (property as any).addressLine1 ?? null;
  const addressLine2 = (property as any).addressLine2 ?? null;
  const city = (property as any).city ?? null;
  const state = (property as any).state ?? null;
  const zipCode = (property as any).zipCode ?? (property as any).zip ?? null;

  const propertyLabel = [addressLine1, city, state].filter(Boolean).join(', ') || 'Home Report';

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      propertyId,
      propertyLabel,
      templateVersion: 2,
      dataVersion: 1,
    },

    property: {
      id: property.id,
      nickname: (property as any).nickname ?? null,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      propertyType: (property as any).propertyType ?? null,
      yearBuilt: (property as any).yearBuilt ?? null,
      livingAreaSqft: (property as any).livingAreaSqft ?? null,
    },

    inventory: {
      rooms: (property as any).inventoryRooms?.map((r: any) => ({
        id: r.id,
        name: r.name,
      })) ?? [],

      items: (property as any).inventoryItems?.map((i: any) => ({
        id: i.id,
        name: i.name,
        category: i.category ?? null,
        condition: i.condition ?? null,
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
      tasks: (property as any).maintenanceTasks?.map((t: any) => ({
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
        source: t.source ?? null,
      })) ?? [],
    },

    coverage: {
      insurancePolicies: (property as any).insurancePolicies?.map((p: any) => ({
        id: p.id,
        providerName: p.providerName ?? null,
        policyNumber: p.policyNumber ?? null,
        startDate: p.startDate ?? null,
        expiryDate: p.expiryDate ?? null,
        premium: p.premium ?? null,
        coverageAmount: p.coverageAmount ?? null,
        documents: (p.documents ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          fileUrl: d.fileUrl,
        })),
      })) ?? [],

      warranties: (property as any).warranties?.map((w: any) => ({
        id: w.id,
        providerName: w.providerName ?? null,
        policyNumber: w.policyNumber ?? null,
        startDate: w.startDate ?? null,
        expiryDate: w.expiryDate ?? null,
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
    const pdfBuffer = await renderHomeReportPackPdf(snapshot, {
      generatedAtIso: snapshot.meta.generatedAt,
      propertyLabel: snapshot.meta.propertyLabel,
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
