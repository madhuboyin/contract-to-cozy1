// apps/backend/src/controllers/homeReportExport.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  createExportAndGeneratePdf,
  buildShareToken,
} from '../services/homeReportExport.service';
import { presignGetObject } from '../services/storage/presign';

export async function createHomeReportExport(req: Request, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = (req as any).user?.userId as string;

    const { type = 'HOME_REPORT_PACK', sections } = req.body ?? {};

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
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.homeReportExportEvent.create({
      data: { reportId: exp.id, type: 'CREATED' },
    });

    // ✅ FIX: Return standard format
    return res.status(202).json({
      success: true,
      data: {
        exportId: exp.id,
        status: exp.status,
      }
    });
  } catch (error: any) {
    console.error('[createHomeReportExport] Error:', error);
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to create export' 
    });
  }
}

export async function listHomeReportExportsForProperty(req: Request, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = (req as any).user?.userId as string;

    const exports = await prisma.homeReportExport.findMany({
      where: { propertyId, userId },
      orderBy: { requestedAt: 'desc' },
      include: {
        document: true,
      },
      take: 50,
    });

    // ✅ FIX: Return standard format
    return res.json({ 
      success: true,
      data: { exports } 
    });
  } catch (error: any) {
    console.error('[listHomeReportExportsForProperty] Error:', error);
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to list exports' 
    });
  }
}

export async function downloadHomeReportExport(req: Request, res: Response) {
  try {
    const exportId = req.params.exportId;
    const userId = (req as any).user?.userId as string;

    const exp = await prisma.homeReportExport.findUnique({ where: { id: exportId } });

    if (!exp) {
      return res.status(404).json({ 
        success: false,
        message: 'Report export not found' 
      });
    }
    
    if (exp.userId !== userId) {
      return res.status(403).json({ 
        success: false,
        message: 'Forbidden' 
      });
    }
    
    if (exp.status !== 'READY' || !exp.storageBucket || !exp.storageKey) {
      return res.status(409).json({ 
        success: false,
        message: 'Report not ready' 
      });
    }

    await prisma.homeReportExportEvent.create({
      data: { reportId: exp.id, type: 'DOWNLOADED', meta: { by: 'OWNER' } },
    });

    const url = await presignGetObject({
      bucket: exp.storageBucket,
      key: exp.storageKey,
      expiresInSeconds: 60,
    });

    // ✅ FIX: Return standard format
    return res.json({ 
      success: true,
      data: { url } 
    });
  } catch (error: any) {
    console.error('[downloadHomeReportExport] Error:', error);
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to download' 
    });
  }
} 

export async function createShareLinkForReport(req: Request, res: Response) {
  try {
    const exportId = req.params.exportId;
    const userId = (req as any).user?.userId as string;

    const exp = await prisma.homeReportExport.findUnique({
      where: { id: exportId },
    });

    if (!exp) {
      return res.status(404).json({ 
        success: false,
        message: 'Report export not found' 
      });
    }
    
    if (exp.userId !== userId) {
      return res.status(403).json({ 
        success: false,
        message: 'Forbidden' 
      });
    }

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

    // ✅ FIX: Return standard format
    return res.json({
      success: true,
      data: {
        shareToken: updated.shareToken,
        shareExpiresAt: updated.shareExpiresAt,
      }
    });
  } catch (error: any) {
    console.error('[createShareLinkForReport] Error:', error);
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to create share link' 
    });
  }
}

export async function revokeShareLinkForReport(req: Request, res: Response) {
  try {
    const exportId = req.params.exportId;
    const userId = (req as any).user?.userId as string;

    const exp = await prisma.homeReportExport.findUnique({
      where: { id: exportId },
    });

    if (!exp) {
      return res.status(404).json({ 
        success: false,
        message: 'Report export not found' 
      });
    }
    
    if (exp.userId !== userId) {
      return res.status(403).json({ 
        success: false,
        message: 'Forbidden' 
      });
    }

    await prisma.homeReportExport.update({
      where: { id: exportId },
      data: { shareRevokedAt: new Date() },
    });

    await prisma.homeReportExportEvent.create({
      data: { reportId: exportId, type: 'SHARE_REVOKED' },
    });

    // ✅ FIX: Return standard format
    return res.json({ 
      success: true,
      data: { ok: true } 
    });
  } catch (error: any) {
    console.error('[revokeShareLinkForReport] Error:', error);
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to revoke share link' 
    });
  }
}

export async function downloadHomeReportByShareToken(req: Request, res: Response) {
  try {
    const token = req.params.token;

    const exp = await prisma.homeReportExport.findFirst({
      where: { shareToken: token },
    });

    if (!exp) {
      return res.status(404).json({ 
        success: false,
        message: 'Share link not found' 
      });
    }
    
    if (exp.shareRevokedAt) {
      return res.status(410).json({ 
        success: false,
        message: 'Share link revoked' 
      });
    }
    
    if (exp.shareExpiresAt && new Date() > exp.shareExpiresAt) {
      return res.status(410).json({ 
        success: false,
        message: 'Share link expired' 
      });
    }
    
    if (exp.status !== 'READY' || !exp.storageBucket || !exp.storageKey) {
      return res.status(409).json({ 
        success: false,
        message: 'Report not ready' 
      });
    }

    await prisma.homeReportExportEvent.create({
      data: { reportId: exp.id, type: 'DOWNLOADED', meta: { by: 'SHARE_LINK' } },
    });

    const url = await presignGetObject({
      bucket: exp.storageBucket,
      key: exp.storageKey,
      expiresInSeconds: 60,
    });

    // ✅ FIX: Return standard format
    return res.json({ 
      success: true,
      data: { url } 
    });
  } catch (error: any) {
    console.error('[downloadHomeReportByShareToken] Error:', error);
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to download via share token' 
    });
  }
}