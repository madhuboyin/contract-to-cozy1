import type { NextFunction, Response } from 'express';
import type { CustomRequest } from '../types';
import {
  getPastHazardExposure,
  linkPropertyHazardEvidence,
  recordPropertyHazardOutcome,
} from './pastHazardExposure.service';

export async function getPastHazardExposureView(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await getPastHazardExposure(req.params.propertyId, {
      from: req.query.from ? new Date(String(req.query.from)) : undefined,
      to: req.query.to ? new Date(String(req.query.to)) : undefined,
      hazardType: req.query.hazardType ? String(req.query.hazardType) : undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function recordPastHazardOutcome(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const outcome = await recordPropertyHazardOutcome({
      propertyId: req.params.propertyId,
      propertyMatchId: req.params.propertyMatchId,
      userId: req.user!.userId,
      status: req.body.status,
      effectObservedAt: req.body.effectObservedAt
        ? new Date(req.body.effectObservedAt)
        : null,
      note: req.body.note,
    });
    res.json({ success: true, data: { outcome } });
  } catch (error) {
    next(error);
  }
}

export async function linkPastHazardEvidence(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const evidence = await linkPropertyHazardEvidence({
      propertyId: req.params.propertyId,
      outcomeId: req.params.outcomeId,
      userId: req.user!.userId,
      ...req.body,
    });
    res.status(201).json({ success: true, data: { evidence } });
  } catch (error) {
    next(error);
  }
}
