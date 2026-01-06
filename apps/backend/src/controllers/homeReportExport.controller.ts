// apps/backend/src/controllers/homeReportExport.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  createExportAndGeneratePdf,
  buildShareToken,
} from '../services/homeReportExport.service';
import { presignGetObject } from '../services/storage/presign';
export async function createHomeReportExport(req: Request, res: Response) {
  const propertyId = req.params.propertyId;
  const userId = (req as any).user?.userId as string;

  const { type = 'HOME_REPORT_PACK', sections } = req.body ?? {};

  // Create export row as PENDING; workers will pick it up
  const exp = await prisma.homeReportExport.create({
    data: {
      userId,
      propertyId,
      type,
      status: 'PENDING',
      sections: sections ?? null,
      templateVersion: 1,
      dataVersion: 1,
      timezone: 'America/New_York',
      locale: req.headers['accept-language']?.toString() || 'en-US',

      // default retention (tune as desired)
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.homeReportExportEvent.create({
    data: { reportId: exp.id, type: 'CREATED' },
  });

  return res.status(202).json({
    exportId: exp.id,
    status: exp.status,
  });
}

export async function listHomeReportExportsForProperty(req: Request, res: Response) {
  const propertyId = req.params.propertyId;
  const userId = (req as any).user?.userId as string;

  // Ensure property belongs to user (propertyAuth already ran, but keep consistent)
  const exports = await prisma.homeReportExport.findMany({
    where: { propertyId, userId },
    orderBy: { requestedAt: 'desc' },
    include: {
      document: true,
    },
    take: 50,
  });

  return res.json({ exports });
}

export async function downloadHomeReportExport(req: Request, res: Response) {
  const exportId = req.params.exportId;
  const userId = (req as any).user?.userId as string;

  const exp = await prisma.homeReportExport.findUnique({ where: { id: exportId } });

  if (!exp) return res.status(404).json({ message: 'Report export not found' });
  if (exp.userId !== userId) return res.status(403).json({ message: 'Forbidden' });
  if (exp.status !== 'READY' || !exp.storageBucket || !exp.storageKey) {
    return res.status(409).json({ message: 'Report not ready' });
  }

  await prisma.homeReportExportEvent.create({
    data: { reportId: exp.id, type: 'DOWNLOADED', meta: { by: 'OWNER' } },
  });

  const url = await presignGetObject({
    bucket: exp.storageBucket,
    key: exp.storageKey,
    expiresInSeconds: 60,
  });

  // Option 1: return URL (frontend downloads)
  return res.json({ url });

  // Option 2: redirect
  // return res.redirect(url);
} 

export async function createShareLinkForReport(req: Request, res: Response) {
  const exportId = req.params.exportId;
  const userId = (req as any).user?.userId as string;

  const exp = await prisma.homeReportExport.findUnique({
    where: { id: exportId },
  });

  if (!exp) return res.status(404).json({ message: 'Report export not found' });
  if (exp.userId !== userId) return res.status(403).json({ message: 'Forbidden' });

  const { expiresInDays = 14 } = req.body ?? {};
  const token = buildShareToken();

  const updated = await prisma.homeReportExport.update({
    where: { id: exportId },
    data: {
      shareToken: token,
      shareExpiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      shareRevokedAt: null,
    },
  });

  await prisma.homeReportExportEvent.create({
    data: {
      reportId: exportId,
      type: 'SHARED',
      meta: { expiresInDays },
    },
  });

  return res.json({
    shareToken: updated.shareToken,
    shareExpiresAt: updated.shareExpiresAt,
    // Your frontend can build: /reports/share/:token
  });
}

export async function revokeShareLinkForReport(req: Request, res: Response) {
  const exportId = req.params.exportId;
  const userId = (req as any).user?.userId as string;

  const exp = await prisma.homeReportExport.findUnique({
    where: { id: exportId },
  });

  if (!exp) return res.status(404).json({ message: 'Report export not found' });
  if (exp.userId !== userId) return res.status(403).json({ message: 'Forbidden' });

  await prisma.homeReportExport.update({
    where: { id: exportId },
    data: { shareRevokedAt: new Date() },
  });

  await prisma.homeReportExportEvent.create({
    data: { reportId: exportId, type: 'SHARE_REVOKED' },
  });

  return res.json({ ok: true });
}

export async function downloadHomeReportByShareToken(req: Request, res: Response) {
  
  const exportId = req.params.exportId;
  const userId = (req as any).user?.userId as string;

  const exp = await prisma.homeReportExport.findUnique({ where: { id: exportId } });

  if (!exp) return res.status(404).json({ message: 'Report export not found' });
  if (exp.userId !== userId) return res.status(403).json({ message: 'Forbidden' });
  if (exp.status !== 'READY' || !exp.storageBucket || !exp.storageKey) {
    return res.status(409).json({ message: 'Report not ready' });
  }

  await prisma.homeReportExportEvent.create({
    data: { reportId: exp.id, type: 'DOWNLOADED', meta: { by: 'OWNER' } },
  });

  const url = await presignGetObject({
    bucket: exp.storageBucket,
    key: exp.storageKey,
    expiresInSeconds: 60,
  });

  // Option 1: return URL (frontend downloads)
  return res.json({ url });
}
