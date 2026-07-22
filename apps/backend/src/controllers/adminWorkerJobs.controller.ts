// apps/backend/src/controllers/adminWorkerJobs.controller.ts

import { Request, Response } from 'express';
import { listWorkerJobs, triggerJob, getWorkerGovernanceStatus } from '../services/adminWorkerJobs.service';
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
  try {
    const result = await triggerJob(jobKey, { dryRun });
    auditLog('ADMIN_ACTION', req.user?.userId ?? null, {
      ip: req.ip,
      action: 'trigger_worker_job',
      jobKey,
      dryRun,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    const isClientError =
      err.message.includes('Unknown job key') ||
      err.message.includes('not supported') ||
      err.message.includes('Missing queue config');
    res.status(isClientError ? 400 : 500).json({
      success: false,
      error: { message: err.message },
    });
  }
}
