// apps/backend/src/controllers/homeReportExport.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { buildShareToken, prepareShareArtifacts } from '../services/homeReportExport.service';
import { checkReportWorkerContext } from '../services/planningContext/reportSnapshot';
import { presignGetObject } from '../services/storage/presign';
import { logger } from '../lib/logger';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { resolvePropertyAccess, ROLE_RANK } from '../services/propertyAccess.service';
import { getAggregationContextEnvelope } from '../services/aggregationContext/context';
import { InvalidExportSelectionError } from '../services/ask/askRecordExportSelection';
import { createHomeReportExportRecord } from '../services/homeReportExportCreate.service';
import { createShareLinkRecord, revokeShareLinkRecord } from '../services/homeReportExportShare.service';
import { regenerateHomeReportExportRecord, deleteHomeReportExportRecord } from '../services/homeReportExportManage.service';

async function canMutateReport(propertyId: string, userId: string): Promise<boolean> {
  const access = await resolvePropertyAccess(userId, propertyId);
  return Boolean(access && ROLE_RANK[access.role] >= ROLE_RANK.CONTRIBUTOR);
}

export async function createHomeReportExport(req: Request, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = (req as any).user?.userId as string;

    const { type = 'HOME_REPORT_PACK', sections } = req.body ?? {};

    // The rules (section validation, report context, one export at a time, the stored row) live in the shared service, which the Ask
    // command uses too.
    let outcome;
    try {
      outcome = await createHomeReportExportRecord({ userId, propertyId, type, sections, locale: req.headers['accept-language']?.toString() });
    } catch (error) {
      if (error instanceof InvalidExportSelectionError) {
        return res.status(400).json({ success: false, message: error.message, code: error.code, data: { unavailable: error.unavailable } });
      }
      throw error;
    }
    if (outcome.kind === 'CONTEXT_NOT_READY') {
      return res.status(409).json({ success: false, message: 'Report context is not ready.', data: { propertyContext: outcome.propertyContext } });
    }
    if (outcome.kind === 'IN_FLIGHT') {
      return res.status(409).json({ success: false, message: 'A report export is already in progress for this property.', data: { exportId: outcome.exportId } });
    }

    return res.status(202).json({
      success: true,
      data: {
        exportId: outcome.export.id,
        status: outcome.export.status,
        propertyContext: outcome.propertyContext,
        // What the export carries and what was asked for but could not be carried.
        selection: outcome.selection,
      }
    });
  } catch (error: any) {
    logger.error({ err: error }, '[createHomeReportExport] Error');
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
    const propertyContext = await getAggregationContextEnvelope(propertyId, userId, 'REPORT_SUMMARIES');

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.DASHBOARD,
      featureKey: AnalyticsFeature.HOME_REPORT_EXPORT,
      metadataJson: { exportCount: exports.length },
    });

    // ✅ FIX: Return standard format
    return res.json({
      success: true,
      data: { exports, propertyContext }
    });
  } catch (error: any) {
    logger.error({ err: error }, '[listHomeReportExportsForProperty] Error');
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

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId: exp.propertyId,
      moduleKey: AnalyticsModule.DASHBOARD,
      featureKey: AnalyticsFeature.HOME_REPORT_EXPORT,
      metadataJson: { actionType: 'download' },
    });

    // ✅ FIX: Return standard format
    return res.json({
      success: true,
      data: { url }
    });
  } catch (error: any) {
    logger.error({ err: error }, '[downloadHomeReportExport] Error');
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to download' 
    });
  }
} 

const SHARE_FAILURE: Record<string, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: 'Report export not found' },
  FORBIDDEN: { status: 403, message: 'Forbidden' },
  NOT_CONTRIBUTOR: { status: 403, message: 'Report changes require CONTRIBUTOR access.' },
  DELETED: { status: 410, message: 'Report was deleted' },
};

export async function createShareLinkForReport(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId as string;
    const { expiresInDays = 14 } = req.body ?? {};
    // The rules (ownership, contributor role, not deleted, redacted copy first) live in the shared service, which the Ask command uses too.
    const outcome = await createShareLinkRecord({ exportId: req.params.exportId, userId, expiresInDays });
    if (outcome.kind !== 'CREATED') {
      const failure = SHARE_FAILURE[outcome.kind];
      return res.status(failure.status).json({ success: false, message: failure.message });
    }
    return res.json({ success: true, data: { shareToken: outcome.shareToken, shareExpiresAt: outcome.shareExpiresAt } });
  } catch (error: any) {
    logger.error({ err: error }, '[createShareLinkForReport] Error');
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to create share link' 
    });
  }
}

export async function revokeShareLinkForReport(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId as string;
    const outcome = await revokeShareLinkRecord({ exportId: req.params.exportId, userId });
    if (outcome.kind !== 'REVOKED') {
      const failure = SHARE_FAILURE[outcome.kind];
      return res.status(failure.status).json({ success: false, message: failure.message });
    }
    return res.json({ success: true, data: { ok: true } });
  } catch (error: any) {
    logger.error({ err: error }, '[revokeShareLinkForReport] Error');
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
    
    // Fail closed: share downloads only ever serve the redacted artifact.
    // A share link without prepared redacted artifacts serves nothing.
    if (exp.status !== 'READY' || !exp.shareStorageBucket || !exp.shareStorageKey) {
      return res.status(409).json({
        success: false,
        message: 'Shared report not ready'
      });
    }

    // Stale-output reconciliation (feature policy): a shared report whose
    // generation context no longer matches the property's current context
    // stops serving. The owner re-shares to publish a fresh artifact.
    const currentContext = await checkReportWorkerContext(exp.propertyId);
    if (!exp.contextVersion || currentContext.contextVersion !== exp.contextVersion) {
      await prisma.homeReportExportEvent.create({
        data: {
          reportId: exp.id,
          type: 'EXPIRED',
          meta: { by: 'SHARE_LINK', reason: 'CONTEXT_CHANGED_SINCE_GENERATION' },
        },
      });
      return res.status(410).json({
        success: false,
        message: 'This shared report is out of date. Ask the owner to share a fresh report.',
      });
    }

    await prisma.homeReportExportEvent.create({
      data: { reportId: exp.id, type: 'DOWNLOADED', meta: { by: 'SHARE_LINK', artifact: 'REDACTED' } },
    });

    const url = await presignGetObject({
      bucket: exp.shareStorageBucket,
      key: exp.shareStorageKey,
      expiresInSeconds: 60,
    });

    // ✅ FIX: Return standard format
    return res.json({ 
      success: true,
      data: { url } 
    });
  } catch (error: any) {
    logger.error({ err: error }, '[downloadHomeReportByShareToken] Error');
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to download via share token' 
    });
  }
}

export async function regenerateHomeReportExport(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId as string;
    // The rules (ownership, contributor role, not deleted, one export at a time, section choice, 30-day keep) live in the shared service,
    // which the Ask command uses too. The worker prepares the PDF from the new PENDING row.
    const outcome = await regenerateHomeReportExportRecord({ exportId: req.params.exportId, userId, locale: req.headers['accept-language']?.toString() });
    if (outcome.kind === 'CONTEXT_NOT_READY') return res.status(409).json({ success: false, message: 'Report context is not ready.', data: { propertyContext: outcome.propertyContext } });
    if (outcome.kind === 'IN_FLIGHT') return res.status(409).json({ success: false, message: 'A report export is already in progress for this property.', data: { exportId: outcome.exportId } });
    if (outcome.kind !== 'CREATED') {
      const failure = SHARE_FAILURE[outcome.kind];
      return res.status(outcome.kind === 'DELETED' ? 409 : failure.status).json({ success: false, message: failure.message });
    }
    return res.status(202).json({ success: true, data: { exportId: outcome.export.id, status: outcome.export.status } });
  } catch (error: any) {
    logger.error({ err: error }, '[regenerateHomeReportExport] Error');
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to regenerate export',
    });
  }
}

export async function deleteHomeReportExport(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId as string;
    const outcome = await deleteHomeReportExportRecord({ exportId: req.params.exportId, userId });
    if (outcome.kind !== 'DELETED') {
      const failure = SHARE_FAILURE[outcome.kind];
      return res.status(failure.status).json({ success: false, message: failure.message });
    }
    return res.json({ success: true, data: { ok: true } });
  } catch (error: any) {
    logger.error({ err: error }, '[deleteHomeReportExport] Error');
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete export',
    });
  }
}
