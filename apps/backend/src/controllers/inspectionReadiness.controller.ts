// apps/backend/src/controllers/inspectionReadiness.controller.ts

import { Response, NextFunction } from 'express';
import { CustomRequest as Request } from '../types';
import { inspectionReadinessService } from '../services/inspectionReadiness.service';
import { APIError } from '../middleware/error.middleware';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

export async function runInspectionReadinessCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw new APIError('At least one photo is required', 400, 'NO_PHOTOS');
    }

    const check = await inspectionReadinessService.runCheck(
      req.params.propertyId,
      req.params.permitId,
      req.params.milestoneId,
      req.user!.userId,
      files,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user!.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.INSPECTION,
      featureKey: AnalyticsFeature.INSPECTION_READINESS,
      metadataJson: { actionType: 'run_readiness_check', photoCount: files.length },
    });

    res.status(201).json({ success: true, data: { check } });
  } catch (err) { next(err); }
}

export async function listInspectionReadinessChecks(req: Request, res: Response, next: NextFunction) {
  try {
    const checks = await inspectionReadinessService.listChecksForMilestone(
      req.params.propertyId,
      req.params.permitId,
      req.params.milestoneId,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.INSPECTION,
      featureKey: AnalyticsFeature.INSPECTION_READINESS,
      metadataJson: { checkCount: checks.length },
    });

    res.json({ success: true, data: { checks } });
  } catch (err) { next(err); }
}

export async function getInspectionReadinessCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const check = await inspectionReadinessService.getCheck(req.params.propertyId, req.params.checkId);
    res.json({ success: true, data: { check } });
  } catch (err) { next(err); }
}
