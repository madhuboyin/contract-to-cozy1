import { NextFunction, Response } from 'express';
import { APIError } from '../middleware/error.middleware';
import { recordAdminAction } from '../services/adminAudit.service';
import { CustomRequest } from '../types';
import {
  RadarAdminNotFoundError,
  RadarAdminOperationError,
  radarAdminOperationsService,
} from '../modules/homeEventRadar/services/radarAdminOperations.service';

function actorId(req: CustomRequest): string {
  if (!req.user?.userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');
  return req.user.userId;
}

function forward(error: unknown, next: NextFunction) {
  if (error instanceof RadarAdminNotFoundError) {
    return next(new APIError(error.message, 404, 'RADAR_ADMIN_NOT_FOUND'));
  }
  if (error instanceof RadarAdminOperationError) {
    return next(new APIError(error.message, 409, 'RADAR_ADMIN_OPERATION_BLOCKED'));
  }
  return next(error);
}

export async function listRadarSources(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    actorId(req);
    res.json({ success: true, data: await radarAdminOperationsService.listSources() });
  } catch (error) {
    forward(error, next);
  }
}

export async function getRadarSource(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    actorId(req);
    res.json({ success: true, data: await radarAdminOperationsService.getSource(req.params.sourceKey) });
  } catch (error) {
    forward(error, next);
  }
}

export async function testRadarSource(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const adminId = actorId(req);
    const result = await radarAdminOperationsService.testFetch(
      req.params.sourceKey,
      req.body.propertyId,
    );
    await recordAdminAction({
      actorId: adminId,
      action: 'RADAR_SOURCE_TEST_FETCH',
      entityType: 'RADAR_SOURCE',
      entityId: req.params.sourceKey,
      capability: 'INTEGRATION_MANAGE',
      newValues: { propertyId: req.body.propertyId ?? null, jobId: result.jobId ?? null },
      req,
    });
    res.status(202).json({ success: true, data: result });
  } catch (error) {
    forward(error, next);
  }
}

export async function runRadarSourceScoped(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const adminId = actorId(req);
    const result = await radarAdminOperationsService.runScoped(
      req.params.sourceKey,
      req.body.propertyId,
    );
    await recordAdminAction({
      actorId: adminId,
      action: 'RADAR_SOURCE_SCOPED_RUN',
      entityType: 'RADAR_SOURCE',
      entityId: req.params.sourceKey,
      capability: 'INTEGRATION_MANAGE',
      newValues: { propertyId: req.body.propertyId, jobId: result.jobId ?? null },
      req,
    });
    res.status(202).json({ success: true, data: result });
  } catch (error) {
    forward(error, next);
  }
}

export async function replayRadarRun(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const adminId = actorId(req);
    const result = await radarAdminOperationsService.replayRun(
      req.params.runId,
      req.body.propertyId,
    );
    await recordAdminAction({
      actorId: adminId,
      action: 'RADAR_SOURCE_RUN_REPLAY',
      entityType: 'RADAR_SOURCE_RUN',
      entityId: req.params.runId,
      capability: 'INTEGRATION_MANAGE',
      relatedRefs: { sourceKey: result.sourceKey, queuedJobId: result.jobId ?? null },
      newValues: { propertyId: result.propertyId },
      req,
    });
    res.status(202).json({ success: true, data: result });
  } catch (error) {
    forward(error, next);
  }
}

export async function setRadarSourcePause(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const adminId = actorId(req);
    const before = await radarAdminOperationsService.getSource(req.params.sourceKey);
    const source = await radarAdminOperationsService.setPaused(
      req.params.sourceKey,
      req.body.paused,
      adminId,
      req.body.reason,
    );
    await recordAdminAction({
      actorId: adminId,
      action: req.body.paused ? 'RADAR_SOURCE_PAUSE' : 'RADAR_SOURCE_RESUME',
      entityType: 'RADAR_SOURCE',
      entityId: req.params.sourceKey,
      capability: 'INTEGRATION_MANAGE',
      reason: req.body.reason,
      oldValues: {
        pausedAt: before.operationsPausedAt?.toISOString() ?? null,
        pausedBy: before.operationsPausedBy ?? null,
        pauseReason: before.operationsPauseReason ?? null,
      },
      newValues: {
        pausedAt: source.operationsPausedAt?.toISOString() ?? null,
        pausedBy: source.operationsPausedBy ?? null,
        pauseReason: source.operationsPauseReason ?? null,
      },
      req,
    });
    res.json({ success: true, data: source });
  } catch (error) {
    forward(error, next);
  }
}

export async function getRadarEventLineage(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    actorId(req);
    res.json({
      success: true,
      data: await radarAdminOperationsService.getEventLineage(req.params.eventId),
    });
  } catch (error) {
    forward(error, next);
  }
}

export async function listRadarAnomalies(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    actorId(req);
    res.json({ success: true, data: await radarAdminOperationsService.listAnomalies() });
  } catch (error) {
    forward(error, next);
  }
}
