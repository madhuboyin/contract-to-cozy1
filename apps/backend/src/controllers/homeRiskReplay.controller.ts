import { NextFunction, Response } from 'express';
import { APIError } from '../middleware/error.middleware';
import { CustomRequest } from '../types';
import { HomeRiskReplayService } from '../services/homeRiskReplay.service';

const service = new HomeRiskReplayService();

function requireUser(req: CustomRequest): { userId: string } {
  const userId = req.user?.userId;
  if (!userId) {
    throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  return { userId };
}

export async function generateHomeRiskReplay(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUser(req);
    const { propertyId } = req.params;
    const result = await service.generateRun(propertyId, req.body);

    res.status(result.reused ? 200 : 201).json({
      success: true,
      data: {
        replay: result.replay,
        reused: result.reused,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listHomeRiskReplayRuns(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUser(req);
    const { propertyId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await service.listRuns(propertyId, { limit });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getHomeRiskReplayDetail(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUser(req);
    const { propertyId, replayRunId } = req.params;
    const replay = await service.getRunDetail(propertyId, replayRunId);

    res.json({
      success: true,
      data: {
        replay,
      },
    });
  } catch (error) {
    next(error);
  }
}
