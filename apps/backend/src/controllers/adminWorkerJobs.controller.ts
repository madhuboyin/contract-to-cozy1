// apps/backend/src/controllers/adminWorkerJobs.controller.ts

import { Request, Response } from 'express';
import { listWorkerJobs, triggerJob } from '../services/adminWorkerJobs.service';

export async function getWorkerJobsHandler(req: Request, res: Response): Promise<void> {
  try {
    const jobs = await listWorkerJobs();
    res.json({ success: true, data: jobs });
  } catch (err: any) {
    console.error('[ADMIN-JOBS] Failed to list worker jobs:', err.message);
    res.status(500).json({ success: false, error: { message: 'Failed to load worker jobs' } });
  }
}

export async function triggerJobHandler(req: Request, res: Response): Promise<void> {
  const { jobKey } = req.params;
  try {
    const result = await triggerJob(jobKey);
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
