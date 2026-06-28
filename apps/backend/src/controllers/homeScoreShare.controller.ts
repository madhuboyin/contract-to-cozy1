import { Request, Response } from 'express';
import { CustomRequest } from '../types';
import { HomeScoreReportService } from '../services/homeScoreReport.service';
import { logger } from '../lib/logger';

const service = new HomeScoreReportService();

export async function createBuyerShareToken(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const expiresInDays = Number(req.body?.expiresInDays) || 30;
    const { token, expiresAt } = await service.createBuyerShareToken(propertyId, userId, expiresInDays);

    const shareUrl = `${req.headers.origin || process.env.FRONTEND_URL || ''}/home-score/share/${token}`;

    return res.status(201).json({
      success: true,
      data: { shareUrl, token, expiresAt: expiresAt.toISOString() },
    });
  } catch (error: any) {
    logger.error({ err: error }, '[createBuyerShareToken] Error');
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to create share link.' });
  }
}

export async function revokeBuyerShareToken(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    await service.revokeBuyerShareToken(propertyId, userId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, '[revokeBuyerShareToken] Error');
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to revoke share link.' });
  }
}

export async function getBuyerReport(req: Request, res: Response) {
  try {
    const token = req.params.token;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required.' });
    }

    const result = await service.getBuyerReport(token);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, '[getBuyerReport] Error');
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to load buyer report.' });
  }
}

export async function getBuyerReportPreview(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const result = await service.getBuyerReportPreview(propertyId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, '[getBuyerReportPreview] Error');
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to load preview.' });
  }
}
