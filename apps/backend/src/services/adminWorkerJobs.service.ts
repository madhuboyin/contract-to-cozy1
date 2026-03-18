// apps/backend/src/services/adminWorkerJobs.service.ts
//
// Admin Worker Jobs service — live BullMQ queue stats + manual trigger.
// Job registry is defined in ../config/workerJobRegistry.ts (shared with worker).

import { Queue } from 'bullmq';
import { connection } from './JobQueue.service';
import { JOB_REGISTRY } from '../config/workerJobRegistry';

// Re-export types so routes/controllers don't need two import paths
export type { JobCategory, JobRegistryEntry } from '../config/workerJobRegistry';

// ─── Additional types (service-layer only) ────────────────────────────────────

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export interface RecentRun {
  id: string;
  jobName: string;
  status: 'completed' | 'failed';
  finishedAt: number | null;
  durationMs: number | null;
  failReason?: string;
}

export interface WorkerJobDetail {
  key: string;
  name: string;
  description: string;
  category: import('../config/workerJobRegistry').JobCategory;
  schedule: string;
  cronExpression: string;
  type: 'bullmq' | 'cron';
  queueName?: string;
  jobName?: string;
  triggerSupported: boolean;
  queueStats?: QueueStats;
  recentRuns: RecentRun[];
}

// ─── Queue instances (lazy, keyed by name) ────────────────────────────────────

const queueCache = new Map<string, Queue>();

function getQueue(queueName: string): Queue {
  if (!queueCache.has(queueName)) {
    queueCache.set(queueName, new Queue(queueName, { connection }));
  }
  return queueCache.get(queueName)!;
}

// ─── Service functions ────────────────────────────────────────────────────────

async function getQueueStats(queueName: string): Promise<QueueStats> {
  const q = getQueue(queueName);
  const [waiting, active, completed, failed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
  ]);
  return { waiting, active, completed, failed };
}

async function getRecentRuns(queueName: string, limit = 3): Promise<RecentRun[]> {
  const q = getQueue(queueName);
  const [completed, failed] = await Promise.all([
    q.getCompleted(0, limit - 1),
    q.getFailed(0, limit - 1),
  ]);

  const runs: RecentRun[] = [
    ...completed.map((job) => ({
      id: job.id ?? '',
      jobName: job.name,
      status: 'completed' as const,
      finishedAt: job.finishedOn ?? null,
      durationMs:
        job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
    })),
    ...failed.map((job) => ({
      id: job.id ?? '',
      jobName: job.name,
      status: 'failed' as const,
      finishedAt: job.finishedOn ?? null,
      durationMs:
        job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
      failReason: job.failedReason ?? undefined,
    })),
  ];

  return runs
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, limit);
}

export async function listWorkerJobs(): Promise<WorkerJobDetail[]> {
  return Promise.all(
    JOB_REGISTRY.map(async (job) => {
      if (!job.queueName) {
        return { ...job, recentRuns: [] };
      }
      try {
        const [queueStats, recentRuns] = await Promise.all([
          getQueueStats(job.queueName),
          getRecentRuns(job.queueName),
        ]);
        return { ...job, queueStats, recentRuns };
      } catch {
        return { ...job, recentRuns: [] };
      }
    }),
  );
}

export async function triggerJob(jobKey: string): Promise<{ queued: boolean; jobId?: string }> {
  const entry = JOB_REGISTRY.find((j) => j.key === jobKey);
  if (!entry) throw new Error(`Unknown job key: ${jobKey}`);
  if (!entry.triggerSupported) throw new Error(`Manual trigger not supported for job: ${jobKey}`);
  if (!entry.queueName || !entry.jobName) throw new Error(`Missing queue config for job: ${jobKey}`);

  const q = getQueue(entry.queueName);
  const job = await q.add(
    entry.jobName,
    {},
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  );
  return { queued: true, jobId: job.id };
}
