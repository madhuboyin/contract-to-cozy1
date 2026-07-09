import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { markNarrativeRun, getOrCreateActiveNarrativeRun } from '../services/narrativeRun.service';
import { PatchNarrativeRunBody } from '../validators/narrative.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

export async function createOrGetNarrativeRun(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    const propertyId = req.params.propertyId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const run = await getOrCreateActiveNarrativeRun({ propertyId, userId });

    if (run) {
      analyticsEmitter.track({
        eventType: AnalyticsEvent.TOOL_USED,
        userId,
        propertyId,
        moduleKey: AnalyticsModule.AI_INSIGHTS,
        featureKey: AnalyticsFeature.NARRATIVE,
        metadataJson: { status: run.status },
      });
    }

    return res.status(200).json({ success: true, data: { run } });
  } catch (error) {
    return next(error);
  }
}

export async function patchNarrativeRun(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    const runId = req.params.runId;
    const body = req.body as PatchNarrativeRunBody;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const run = await markNarrativeRun({
      runId,
      userId,
      action: body.action,
      metadata: body.metadata,
    });

    // Only the meaningful completion/dismissal actions represent real "tool
    // usage" outcomes; VIEWED/CTA_CLICKED/NUDGE_CLICKED are lighter engagement
    // pings not worth counting as a distinct action-completion event.
    if (body.action === 'COMPLETED' || body.action === 'DISMISSED') {
      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        userId,
        propertyId: run.propertyId,
        moduleKey: AnalyticsModule.AI_INSIGHTS,
        featureKey: AnalyticsFeature.NARRATIVE,
        metadataJson: { actionType: body.action.toLowerCase() },
      });
    }

    return res.status(200).json({ success: true, data: { run } });
  } catch (error) {
    return next(error);
  }
}
