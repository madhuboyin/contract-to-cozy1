import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { markNarrativeRun, getOrCreateActiveNarrativeRun } from '../services/narrativeRun.service';
import { PatchNarrativeRunBody } from '../validators/narrative.validators';

export async function createOrGetNarrativeRun(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    const propertyId = req.params.propertyId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const run = await getOrCreateActiveNarrativeRun({ propertyId, userId });
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

    return res.status(200).json({ success: true, data: { run } });
  } catch (error) {
    return next(error);
  }
}
