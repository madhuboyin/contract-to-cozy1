import { Response } from 'express';
import { CustomRequest } from '../types';
import { HomeScoreCorrectionInput, HomeScoreReportService } from '../services/homeScoreReport.service';

const service = new HomeScoreReportService();

function parseWeeks(input: unknown, fallback: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(8, Math.min(104, Math.round(parsed)));
}

export async function getHomeScoreReport(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const weeks = parseWeeks(req.query.weeks, 26);
    const report = await service.getReport(propertyId, userId, weeks);
    return res.json({ success: true, data: { report } });
  } catch (error: any) {
    console.error('Error fetching home score report:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch home score report.',
    });
  }
}

export async function refreshHomeScoreReport(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const weeks = parseWeeks(req.query.weeks, 26);
    const report = await service.refresh(propertyId, userId, weeks);
    return res.json({ success: true, data: { report } });
  } catch (error: any) {
    console.error('Error refreshing home score report:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to refresh home score report.',
    });
  }
}

export async function getHomeScoreHistory(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const weeks = parseWeeks(req.query.weeks, 52);
    const history = await service.getHistory(propertyId, userId, weeks);
    return res.json({ success: true, data: { history } });
  } catch (error: any) {
    console.error('Error fetching home score history:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch home score history.',
    });
  }
}

export async function getHomeScoreFactors(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const weeks = parseWeeks(req.query.weeks, 26);
    const factors = await service.getFactors(propertyId, userId, weeks);
    return res.json({ success: true, data: { factors } });
  } catch (error: any) {
    console.error('Error fetching home score factors:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch home score factors.',
    });
  }
}

export async function getHomeScoreCorrections(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const corrections = await service.getCorrections(propertyId, userId, limit);
    return res.json({ success: true, data: { corrections } });
  } catch (error: any) {
    console.error('Error fetching home score corrections:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch home score corrections.',
    });
  }
}

export async function submitHomeScoreCorrection(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const payload = (req.body ?? {}) as HomeScoreCorrectionInput;
    const result = await service.submitCorrection(propertyId, userId, payload);
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error submitting home score correction:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to submit home score correction.',
    });
  }
}
