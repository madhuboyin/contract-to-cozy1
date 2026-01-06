// apps/backend/src/controllers/homeReportExport.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createExportAndGeneratePdf, buildShareToken } from '../services/homeReportExport.service';
import { presignGetObject } from '../services/storage/presign';
import { getS3Client } from '../services/storage/s3Client';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';


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
      where: { propertyId, userId, status: { not: 'DELETED' } },
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
    
    if (exp.status === 'DELETED') {
      return res.status(410).json({
        success: false,
        message: 'Report was deleted',
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

    if (exp.status === 'DELETED') {
      return res.status(410).json({
        success: false,
        message: 'Report was deleted',
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

    if (exp.status === 'DELETED') {
      return res.status(410).json({
        success: false,
        message: 'Report was deleted',
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

    if (exp.status === 'DELETED') {
      return res.status(410).json({
        success: false,
        message: 'Report was deleted',
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

export async function regenerateHomeReportExport(req: Request, res: Response) {
  try {
    const exportId = req.params.exportId;
    const userId = (req as any).user?.userId as string;

    const existing = await prisma.homeReportExport.findUnique({
      where: { id: exportId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Report export not found' });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (existing.deletedAt) {
      return res.status(409).json({ success: false, message: 'Report was deleted' });
    }

    // Create a NEW export (keep history)
    const exp = await prisma.homeReportExport.create({
      data: {
        userId,
        propertyId: existing.propertyId,
        type: existing.type,
        status: 'PENDING',
        sections: existing.sections ?? undefined,
        templateVersion: existing.templateVersion ?? 1,
        dataVersion: existing.dataVersion ?? 1,
        timezone: existing.timezone ?? 'America/New_York',
        locale: existing.locale ?? 'en-US',
        expiresAt: existing.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),

        regeneratedFromId: existing.id,
      },
    });

    await prisma.homeReportExportEvent.create({
      data: { reportId: exp.id, type: 'CREATED', meta: { regeneratedFromId: existing.id } },
    });

    // Queue the PDF generation (same service you already use)
    await createExportAndGeneratePdf({
      userId: exp.userId,
      propertyId: exp.propertyId,
      type: exp.type,
      sections: exp.sections as any,
      locale: exp.locale ?? undefined,
      timezone: exp.timezone ?? undefined,
    });

    return res.status(202).json({
      success: true,
      data: {
        exportId: exp.id,
        status: exp.status,
      },
    });
  } catch (error: any) {
    console.error('[regenerateHomeReportExport] Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to regenerate export',
    });
  }
}

export async function deleteHomeReportExport(req: Request, res: Response) {
  try {
    const exportId = req.params.exportId;
    const userId = (req as any).user?.userId as string;

    const exp = await prisma.homeReportExport.findUnique({
      where: { id: exportId },
    });

    if (!exp) {
      return res.status(404).json({ success: false, message: 'Report export not found' });
    }

    if (exp.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Idempotent delete
    if (exp.status === 'DELETED') {
      return res.json({ success: true, data: { ok: true } });
    }

    // Optional: prevent delete while generating
    // if (exp.status === 'PENDING' || exp.status === 'GENERATING') {
    //   return res.status(409).json({ success: false, message: 'Report is still generating' });
    // }

    // Best-effort S3 delete
    if (exp.storageBucket && exp.storageKey) {
      try {
        const s3 = getS3Client();
        await s3.send(
          new DeleteObjectCommand({
            Bucket: exp.storageBucket,
            Key: exp.storageKey,
          })
        );
      } catch (err) {
        // Never fail deletion due to S3 cleanup issues
        console.warn('[deleteHomeReportExport] S3 delete failed:', err);
      }
    }

    await prisma.homeReportExport.update({
      where: { id: exportId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deletedByUserId: userId,

        // Immediately invalidate share links
        shareRevokedAt: new Date(),
        shareExpiresAt: new Date(),
      },
    });

    await prisma.homeReportExportEvent.create({
      data: { reportId: exportId, type: 'DELETED', meta: { by: 'OWNER' } },
    });

    return res.json({ success: true, data: { ok: true } });
  } catch (error: any) {
    console.error('[deleteHomeReportExport] Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete export',
    });
  }
}



