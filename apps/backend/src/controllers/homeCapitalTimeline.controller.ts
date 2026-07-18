// apps/backend/src/controllers/homeCapitalTimeline.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeCapitalTimelineService } from '../services/homeCapitalTimeline.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { APIError } from '../middleware/error.middleware';
import {
  assertFinancialContextApplicable,
  getFinancialContextEnvelope,
} from '../services/financialContext/context';
import { evaluateFeatureContext } from '../modules/propertyContext/application/evaluateFeatureContext';

type TimelineNextAction = { href: string; label: string; reason: string };

function buildTimelineNextAction(propertyId: string, analysis: any): TimelineNextAction | null {
  if (!analysis) return null;
  const items: any[] = Array.isArray(analysis.items) ? analysis.items : [];
  const highItem = items.find((i) => i.priority === 'HIGH');
  if (highItem) {
    const cat = String(highItem.category ?? 'capital item').toLowerCase().replace(/_/g, ' ');
    return {
      href: `/dashboard/properties/${propertyId}/tools/budget-planner`,
      label: `Plan budget for upcoming ${cat}`,
      reason: 'You have a high-priority capital expense within the next 2 years',
    };
  }
  if (items.length === 0) {
    return {
      href: `/dashboard/properties/${propertyId}/inventory`,
      label: 'Add appliances and systems to get started',
      reason: 'No inventory items found — add items to generate a capital timeline',
    };
  }
  if (analysis.confidence === 'LOW') {
    return {
      href: `/dashboard/properties/${propertyId}/inventory`,
      label: 'Improve timeline accuracy',
      reason: 'Add install dates and conditions to inventory items to raise confidence',
    };
  }
  return {
    href: `/dashboard/properties/${propertyId}/tools/true-cost`,
    label: 'See full cost of ownership',
    reason: 'Pair capital planning with your projected operating costs',
  };
}

const service = new HomeCapitalTimelineService();

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  return userId;
}

function generatedContextVersion(analysis: any): string | null {
  const snapshot = analysis?.inputsSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const value = snapshot._propertyContextVersion;
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function getLatestTimeline(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const userId = requireUserId(req);
    const analysis = await service.getLatestTimeline(propertyId);
    const snapshot =
      analysis?.inputsSnapshot &&
      typeof analysis.inputsSnapshot === 'object' &&
      !Array.isArray(analysis.inputsSnapshot)
        ? (analysis.inputsSnapshot as Record<string, unknown>)
        : {};
    const assumptionSetId =
      typeof snapshot.assumptionSetId === 'string' ? snapshot.assumptionSetId : null;
    const nextAction = buildTimelineNextAction(propertyId, analysis);
    const propertyContext = await getFinancialContextEnvelope(
      propertyId,
      userId,
      'CAPITAL_TIMELINE',
      generatedContextVersion(analysis),
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.HOME_CAPITAL_TIMELINE,
      metadataJson: { confidence: analysis?.confidence ?? null },
    });

    res.json({ success: true, data: { analysis, assumptionSetId, nextAction, propertyContext } });
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
    const userId = requireUserId(req);
    const currentContext = await assertFinancialContextApplicable(
      propertyId,
      userId,
      'CAPITAL_TIMELINE',
      'capitalPlanning',
    );
    const featureContext = await evaluateFeatureContext(propertyId, userId, {
      featureKey: 'CAPITAL_TIMELINE',
      operationKey: 'RUN_TIMELINE',
    });
    if (!featureContext.canExecute) {
      throw new APIError('Required property context is incomplete.', 409, 'PROPERTY_CONTEXT_REQUIRED', featureContext);
    }
    const horizonYears = req.body.horizonYears ?? 10;
    const analysis = await service.runTimeline(propertyId, homeownerProfileId, horizonYears, {
      assumptionSetId:
        typeof req.body?.assumptionSetId === 'string' ? req.body.assumptionSetId : undefined,
      financialAssumptions:
        req.body?.financialAssumptions && typeof req.body.financialAssumptions === 'object'
          ? req.body.financialAssumptions
          : undefined,
      createdByUserId: userId ?? null,
      propertyContextVersion: currentContext.contextVersion,
    });
    const snapshot =
      analysis.inputsSnapshot &&
      typeof analysis.inputsSnapshot === 'object' &&
      !Array.isArray(analysis.inputsSnapshot)
        ? (analysis.inputsSnapshot as Record<string, unknown>)
        : {};
    const assumptionSetId =
      typeof snapshot.assumptionSetId === 'string' ? snapshot.assumptionSetId : null;
    const nextAction = buildTimelineNextAction(propertyId, analysis);
    const propertyContext = await getFinancialContextEnvelope(
      propertyId,
      userId,
      'CAPITAL_TIMELINE',
      generatedContextVersion(analysis),
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.HOME_CAPITAL_TIMELINE,
      metadataJson: { actionType: 'run_timeline', horizonYears },
    });

    res.status(201).json({ success: true, data: { analysis, assumptionSetId, nextAction, propertyContext } });
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
    const userId = requireUserId(req);
    await assertFinancialContextApplicable(propertyId, userId, 'CAPITAL_TIMELINE', 'capitalPlanning');
    const override = await service.createOverride(propertyId, req.body);
    res.status(201).json({ success: true, data: { override } });
  } catch (err) {
    next(err);
  }
}

export async function updateOverride(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const userId = requireUserId(req);
    await assertFinancialContextApplicable(propertyId, userId, 'CAPITAL_TIMELINE', 'capitalPlanning');
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
    const userId = requireUserId(req);
    await assertFinancialContextApplicable(propertyId, userId, 'CAPITAL_TIMELINE', 'capitalPlanning');
    const overrideId = req.params.overrideId;
    await service.deleteOverride(propertyId, overrideId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
