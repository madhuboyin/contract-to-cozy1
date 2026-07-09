import { NextFunction, Response } from 'express';
import { APIError } from '../middleware/error.middleware';
import { CustomRequest } from '../types';
import { HomeRiskReplayService } from '../services/homeRiskReplay.service';
import { TrackHomeRiskReplayEventBody } from '../validators/homeRiskReplay.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

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
    const { userId } = requireUser(req);
    const { propertyId } = req.params;
    const result = await service.generateRun(propertyId, req.body);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.RISK,
      featureKey: AnalyticsFeature.HOME_RISK_REPLAY,
      metadataJson: { actionType: 'generate_replay', reused: result.reused },
    });

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
    const { userId } = requireUser(req);
    const { propertyId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await service.listRuns(propertyId, { limit });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.RISK,
      featureKey: AnalyticsFeature.HOME_RISK_REPLAY,
      metadataJson: { runCount: result.runs.length },
    });

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

export async function trackHomeRiskReplayEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const { propertyId } = req.params;
    const payload = req.body as TrackHomeRiskReplayEventBody;
    const result = await service.trackEvent(propertyId, userId, payload);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
