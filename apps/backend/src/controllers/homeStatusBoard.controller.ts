import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { listBoard, ensureHomeItems, computeStatuses, patchItemStatus } from '../services/homeStatusBoard.service';
import { listBoardQuerySchema } from '../validators/homeStatusBoard.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

export async function getBoard(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const query = listBoardQuerySchema.parse(req.query);
    const data = await listBoard(propertyId, query);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.DASHBOARD,
      featureKey: AnalyticsFeature.STATUS_BOARD,
      metadataJson: {},
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function recompute(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    await ensureHomeItems(propertyId);
    await computeStatuses(propertyId);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.DASHBOARD,
      featureKey: AnalyticsFeature.STATUS_BOARD,
      metadataJson: { actionType: 'recompute' },
    });

    res.status(200).json({ success: true, data: { message: 'Statuses recomputed' } });
  } catch (error) {
    next(error);
  }
}

export async function patchStatus(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, homeItemId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: { message: 'Authentication required' } });
    }

    const data = await patchItemStatus(homeItemId, propertyId, userId, req.body);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.DASHBOARD,
      featureKey: AnalyticsFeature.STATUS_BOARD,
      metadataJson: { actionType: 'patch_status' },
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
