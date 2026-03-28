// apps/backend/src/controllers/homeCapitalTimeline.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeCapitalTimelineService } from '../services/homeCapitalTimeline.service';

const service = new HomeCapitalTimelineService();

export async function getLatestTimeline(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const analysis = await service.getLatestTimeline(propertyId);
    const snapshot =
      analysis?.inputsSnapshot &&
      typeof analysis.inputsSnapshot === 'object' &&
      !Array.isArray(analysis.inputsSnapshot)
        ? (analysis.inputsSnapshot as Record<string, unknown>)
        : {};
    const assumptionSetId =
      typeof snapshot.assumptionSetId === 'string' ? snapshot.assumptionSetId : null;
    res.json({ success: true, data: { analysis, assumptionSetId } });
  } catch (err) {
    next(err);
  }
}

export async function runTimeline(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const homeownerProfileId = req.user?.homeownerProfile?.id;
    if (!homeownerProfileId) {
      return res.status(403).json({ success: false, error: 'Homeowner profile required' });
    }
    const userId = req.user?.userId;
    const horizonYears = req.body.horizonYears ?? 10;
    const analysis = await service.runTimeline(propertyId, homeownerProfileId, horizonYears, {
      assumptionSetId:
        typeof req.body?.assumptionSetId === 'string' ? req.body.assumptionSetId : undefined,
      financialAssumptions:
        req.body?.financialAssumptions && typeof req.body.financialAssumptions === 'object'
          ? req.body.financialAssumptions
          : undefined,
      createdByUserId: userId ?? null,
    });
    const snapshot =
      analysis.inputsSnapshot &&
      typeof analysis.inputsSnapshot === 'object' &&
      !Array.isArray(analysis.inputsSnapshot)
        ? (analysis.inputsSnapshot as Record<string, unknown>)
        : {};
    const assumptionSetId =
      typeof snapshot.assumptionSetId === 'string' ? snapshot.assumptionSetId : null;
    res.status(201).json({ success: true, data: { analysis, assumptionSetId } });
  } catch (err) {
    next(err);
  }
}

export async function listOverrides(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const overrides = await service.listOverrides(propertyId, {
      inventoryItemId: req.query.inventoryItemId ? String(req.query.inventoryItemId) : undefined,
    });
    res.json({ success: true, data: { overrides } });
  } catch (err) {
    next(err);
  }
}

export async function createOverride(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const override = await service.createOverride(propertyId, req.body);
    res.status(201).json({ success: true, data: { override } });
  } catch (err) {
    next(err);
  }
}

export async function updateOverride(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const overrideId = req.params.overrideId;
    const override = await service.updateOverride(propertyId, overrideId, req.body);
    res.json({ success: true, data: { override } });
  } catch (err) {
    next(err);
  }
}

export async function deleteOverride(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const overrideId = req.params.overrideId;
    await service.deleteOverride(propertyId, overrideId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
