// apps/backend/src/controllers/adminWorkerJobs.controller.ts

import { Request, Response } from 'express';
import {
  listWorkerJobs,
  triggerJob,
  getWorkerGovernanceStatus,
  previewSmokeCleanup,
  deleteSmokeRecords,
} from '../services/adminWorkerJobs.service';
import { logger, auditLog } from '../lib/logger';
import { AuthRequest } from '../types/auth.types';

export async function getWorkerJobsHandler(req: Request, res: Response): Promise<void> {
  try {
    const jobs = await listWorkerJobs();
    res.json({ success: true, data: jobs });
  } catch (err: any) {
    logger.error({ err: err }, '[ADMIN-JOBS] Failed to list worker jobs');
    res.status(500).json({ success: false, error: { message: 'Failed to load worker jobs' } });
  }
}

export async function getWorkerGovernanceHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: getWorkerGovernanceStatus() });
  } catch (err: any) {
    logger.error({ err: err }, '[ADMIN-JOBS] Failed to load worker governance status');
    res.status(500).json({ success: false, error: { message: 'Failed to load worker governance status' } });
  }
}

export async function triggerJobHandler(req: AuthRequest, res: Response): Promise<void> {
  const { jobKey } = req.params;
  const dryRun = req.body?.dryRun === true;
  const propertyId = typeof req.body?.propertyId === 'string' ? req.body.propertyId.trim() || undefined : undefined;
  try {
    const result = await triggerJob(jobKey, { dryRun, propertyId });
    auditLog('ADMIN_ACTION', req.user?.userId ?? null, {
      ip: req.ip,
      action: 'trigger_worker_job',
      jobKey,
      dryRun,
      propertyId,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    const isClientError =
      err.message.includes('Unknown job key') ||
      err.message.includes('not supported') ||
      err.message.includes('Missing queue config') ||
      err.message.includes('SMOKE_TEST_PROPERTY_ALLOWLIST');
    res.status(isClientError ? 400 : 500).json({
      success: false,
      error: { message: err.message },
    });
  }
}

export async function previewSmokeCleanupHandler(req: AuthRequest, res: Response): Promise<void> {
  const { correlationId } = req.params;
  try {
    const preview = await previewSmokeCleanup(correlationId);
    res.json({ success: true, data: preview });
  } catch (err: any) {
    res.status(err.message.includes('Not a smoke correlation ID') ? 400 : 500).json({
      success: false,
      error: { message: err.message },
    });
  }
}

export async function deleteSmokeCleanupHandler(req: AuthRequest, res: Response): Promise<void> {
  const { correlationId } = req.params;
  try {
    const deleted = await deleteSmokeRecords(correlationId);
    auditLog('ADMIN_ACTION', req.user?.userId ?? null, {
      ip: req.ip,
      action: 'delete_smoke_test_records',
      correlationId,
      notificationCount: deleted.notificationIds.length,
      mortgageRateSnapshotCount: deleted.mortgageRateSnapshotIds.length,
    });
    res.json({ success: true, data: deleted });
  } catch (err: any) {
    res.status(err.message.includes('Not a smoke correlation ID') ? 400 : 500).json({
      success: false,
      error: { message: err.message },
    });
  }
}
