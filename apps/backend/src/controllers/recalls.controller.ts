// apps/backend/src/controllers/recalls.controller.ts
import { Response } from 'express';
import { CustomRequest as Request } from '../types';
import {
  confirmRecallMatch,
  dismissRecallMatch,
  listInventoryItemRecallMatches,
  listPropertyRecallMatches,
  resolveRecallMatch,
} from '../services/recalls.service';
import { RecallResolutionType } from '@prisma/client';
import { reportToExactStep } from '../services/guidanceEngine/exactStepReporting';
import { recallStepKeyForAction, reportRecallMatchStep } from '../services/guidanceEngine/guidanceToolReporting';
import { logger } from '../lib/logger';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

function isNotFoundError(err: any) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('not found');
}

export async function listRecalls(req: Request, res: Response) {
  const { propertyId } = req.params as any;

  const rows = await listPropertyRecallMatches(propertyId);

  analyticsEmitter.track({
    eventType: AnalyticsEvent.TOOL_USED,
    userId: req.user?.userId,
    propertyId,
    moduleKey: AnalyticsModule.MARKETPLACE,
    featureKey: AnalyticsFeature.RECALLS,
    metadataJson: { count: Array.isArray(rows) ? rows.length : undefined },
  });

  return res.json({
    propertyId,
    matches: rows,
  });
}

/** A recall action started from a journey step reports to that exact step (and only if the journey is about this match's item); one started elsewhere keeps the family path. */
async function reportRecall(req: Request, propertyId: string, action: 'CONFIRM' | 'DISMISS' | 'RESOLVE', row: any) {
  const stepId = typeof req.query?.guidanceStepId === 'string' ? req.query.guidanceStepId : (typeof (req.body as any)?.guidanceStepId === 'string' ? (req.body as any).guidanceStepId : null);
  if (!stepId) {
    await reportRecallMatchStep(propertyId, action, row);
    return { supplied: false, reported: null, refusal: null } as const;
  }
  return reportToExactStep(propertyId, stepId, { toolKey: 'recalls', stepKeys: [recallStepKeyForAction(action)] },
    (binding) => reportRecallMatchStep(propertyId, action, row, req.user?.userId ?? null, { journeyId: binding.journeyId }),
    (binding) => (row.inventoryItemId && binding.inventoryItemId === row.inventoryItemId ? null : 'WRONG_SUBJECT'));
}

export async function confirmMatch(req: Request, res: Response) {
  const { propertyId, matchId } = req.params as any;

  try {
    const row = await confirmRecallMatch(propertyId, matchId);

    const guidanceReport = await reportRecall(req, propertyId, 'CONFIRM', row);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.MARKETPLACE,
      featureKey: AnalyticsFeature.RECALLS,
      metadataJson: { actionType: 'confirm_match', matchId, recallId: row.recallId },
    });

    return res.json({ ...row, guidanceReport });
  } catch (err: any) {
    if (isNotFoundError(err)) return res.status(404).json({ message: 'Recall match not found' });
    if (err?.statusCode) return res.status(err.statusCode).json({ code: err.code, message: err.message });
    logger.error({ err }, 'confirmMatch error');
    return res.status(500).json({ message: 'Failed to confirm recall match' });
  }
}

export async function dismissMatch(req: Request, res: Response) {
  const { propertyId, matchId } = req.params as any;

  try {
    const row = await dismissRecallMatch(propertyId, matchId);

    const guidanceReport = await reportRecall(req, propertyId, 'DISMISS', row);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.MARKETPLACE,
      featureKey: AnalyticsFeature.RECALLS,
      metadataJson: { actionType: 'dismiss_match', matchId, recallId: row.recallId },
    });

    return res.json({ ...row, guidanceReport });
  } catch (err: any) {
    if (isNotFoundError(err)) return res.status(404).json({ message: 'Recall match not found' });
    if (err?.statusCode) return res.status(err.statusCode).json({ code: err.code, message: err.message });
    logger.error({ err }, 'dismissMatch error');
    return res.status(500).json({ message: 'Failed to dismiss recall match' });
  }
}

export async function resolveMatch(req: Request, res: Response) {
  const { propertyId, matchId } = req.params as any;

  const { resolutionType, resolutionNotes } = req.body as {
    resolutionType: RecallResolutionType;
    resolutionNotes?: string;
  };

  if (!resolutionType) {
    return res.status(400).json({ message: 'resolutionType is required' });
  }

  try {
    const row = await resolveRecallMatch({
      propertyId,
      matchId,
      resolutionType,
      resolutionNotes: resolutionNotes || null,
    });

    const guidanceReport = await reportRecall(req, propertyId, 'RESOLVE', row);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.MARKETPLACE,
      featureKey: AnalyticsFeature.RECALLS,
      metadataJson: { actionType: 'resolve_match', matchId, resolutionType: row.resolutionType },
    });

    return res.json({ ...row, guidanceReport });
  } catch (err: any) {
    if (isNotFoundError(err)) return res.status(404).json({ message: 'Recall match not found' });
    logger.error({ err }, 'resolveMatch error');
    return res.status(500).json({ message: 'Failed to resolve recall match' });
  }
}

export async function listInventoryItemRecalls(req: Request, res: Response) {
  const { propertyId } = req.params;

  // supports both routes:
  // /inventory/:inventoryItemId/recalls
  // /inventory/:itemId/recalls
  const itemId = (req.params as any).inventoryItemId ?? (req.params as any).itemId;

  if (!itemId) {
    return res.status(400).json({ message: 'inventoryItemId is required' });
  }

  const matches = await listInventoryItemRecallMatches(propertyId, itemId);

  return res.json({
    propertyId,
    inventoryItemId: itemId,
    matches,
  });
}
