// apps/backend/src/services/adminWorkerJobs.service.ts
//
// Admin Worker Jobs service — live BullMQ queue stats + manual trigger.
// Job registry is defined in ../config/workerJobRegistry.ts (shared with worker).

import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { connection } from './JobQueue.service';
import { JOB_REGISTRY, RUNNER_REGISTRY } from '../config/workerJobRegistry';
import { DEFAULT_JOB_RETENTION } from '../config/queueDefaults';
import { evaluateWorkerExecution, collectWorkerFlagDiagnostics } from '../config/workerExecutionPolicy';
import { areHumanPolicyApprovalsEnforced } from '../config/appConfig';
import { logger } from '../lib/logger';

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
  status: 'completed' | 'failed' | 'skipped';
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
  /** Whether the worker execution policy currently allows this job to run on its normal (scheduled/poller) trigger. */
  effectiveEnabled: boolean;
  /** Why effectiveEnabled is false — omitted when true. */
  disabledReason?: string;
}

// ─── Cron run history (for jobs with no BullMQ queue) ─────────────────────────
//
// Pure node-cron jobs (no queueName in the registry) don't run through
// BullMQ, so they had no run history on this dashboard at all — every one
// showed "Never run" regardless of how many times it actually succeeded.
// apps/workers/src/lib/cronRunHistory.ts writes a short rolling history per
// job key to this same Redis instance after each cron run; this reads it back.
const CRON_HISTORY_KEY_PREFIX = 'cron-run-history:';

const cronHistoryRedis = new Redis({ ...connection });
cronHistoryRedis.on('error', (err) => {
  logger.error({ err }, '[ADMIN-WORKER-JOBS] cron run history Redis connection error');
});

interface StoredCronRun {
  status: 'completed' | 'failed' | 'skipped';
  finishedAt: number;
  durationMs: number;
  failReason?: string;
}

async function getCronRunHistory(jobKey: string, limit = 3): Promise<RecentRun[]> {
  try {
    const raw = await cronHistoryRedis.lrange(`${CRON_HISTORY_KEY_PREFIX}${jobKey}`, 0, limit - 1);
    return raw.map((entry, i) => {
      const parsed = JSON.parse(entry) as StoredCronRun;
      return {
        id: `${jobKey}-${i}`,
        jobName: jobKey,
        status: parsed.status,
        finishedAt: parsed.finishedAt,
        durationMs: parsed.durationMs,
        failReason: parsed.failReason,
      };
    });
  } catch (err) {
    logger.error({ err }, `[ADMIN-WORKER-JOBS] Failed to read cron run history for "${jobKey}"`);
    return [];
  }
}

// ─── Queue instances (lazy, keyed by name) ────────────────────────────────────

const queueCache = new Map<string, Queue>();

function getQueue(queueName: string): Queue {
  if (!queueCache.has(queueName)) {
    queueCache.set(
      queueName,
      new Queue(queueName, { connection, defaultJobOptions: DEFAULT_JOB_RETENTION }),
    );
  }
  return queueCache.get(queueName)!;
}

// Some registry entries share one physical BullMQ queue (e.g. recall-ingest and
// recall-match both run on 'recall-jobs-queue'). For those, stats/recent-runs
// must be filtered by job.name or each card ends up showing the other job's data.
const SHARED_QUEUE_NAMES = new Set<string>(
  Object.entries(
    JOB_REGISTRY.reduce<Record<string, number>>((counts, job) => {
      if (job.queueName) counts[job.queueName] = (counts[job.queueName] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .filter(([, count]) => count > 1)
    .map(([queueName]) => queueName),
);

// ─── Service functions ────────────────────────────────────────────────────────

async function getQueueStats(queueName: string, jobName?: string): Promise<QueueStats> {
  const q = getQueue(queueName);

  if (!jobName || !SHARED_QUEUE_NAMES.has(queueName)) {
    const [waiting, active, completed, failed] = await Promise.all([
      q.getWaitingCount(),
      q.getActiveCount(),
      q.getCompletedCount(),
      q.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  }

  // Shared queue: the fast Redis counters are queue-wide, not per-job-name, so we
  // have to pull the (retention-capped) job lists and filter/count by name instead.
  const [waitingJobs, activeJobs, completedJobs, failedJobs] = await Promise.all([
    q.getJobs(['waiting'], 0, -1),
    q.getJobs(['active'], 0, -1),
    q.getJobs(['completed'], 0, -1),
    q.getJobs(['failed'], 0, -1),
  ]);
  const countByName = (jobs: { name: string }[]) =>
    jobs.filter((job) => job.name === jobName).length;

  return {
    waiting: countByName(waitingJobs),
    active: countByName(activeJobs),
    completed: countByName(completedJobs),
    failed: countByName(failedJobs),
  };
}

async function getRecentRuns(queueName: string, jobName: string | undefined, limit = 3): Promise<RecentRun[]> {
  const q = getQueue(queueName);
  const isShared = !!jobName && SHARED_QUEUE_NAMES.has(queueName);
  // On a shared queue, the first (limit - 1) completed/failed entries may all belong
  // to the other job, so widen the fetch window before filtering down by name.
  const fetchTo = isShared ? 49 : limit - 1;

  const [completed, failed] = await Promise.all([
    q.getCompleted(0, fetchTo),
    q.getFailed(0, fetchTo),
  ]);

  const filterByName = <T extends { name: string }>(jobs: T[]) =>
    isShared ? jobs.filter((job) => job.name === jobName) : jobs;

  const runs: RecentRun[] = [
    ...filterByName(completed).map((job) => ({
      id: job.id ?? '',
      jobName: job.name,
      status: 'completed' as const,
      finishedAt: job.finishedOn ?? null,
      durationMs:
        job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
    })),
    ...filterByName(failed).map((job) => ({
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

function effectiveExecutionState(job: { key: string } & Parameters<typeof evaluateWorkerExecution>[2]): {
  effectiveEnabled: boolean;
  disabledReason?: string;
} {
  const decision = evaluateWorkerExecution(job.key, 'scheduled', job);
  return decision.allowed ? { effectiveEnabled: true } : { effectiveEnabled: false, disabledReason: decision.reason };
}

export async function listWorkerJobs(): Promise<WorkerJobDetail[]> {
  return Promise.all(
    JOB_REGISTRY.map(async (job) => {
      const state = effectiveExecutionState(job);
      if (!job.queueName) {
        const recentRuns = await getCronRunHistory(job.key);
        return { ...job, ...state, recentRuns };
      }
      try {
        const [queueStats, recentRuns] = await Promise.all([
          getQueueStats(job.queueName, job.jobName),
          getRecentRuns(job.queueName, job.jobName),
        ]);
        return { ...job, ...state, queueStats, recentRuns };
      } catch {
        return { ...job, ...state, recentRuns: [] };
      }
    }),
  );
}

export interface WorkerGovernanceStatus {
  enforceHumanPolicyApprovals: boolean;
  flags: Array<{ key: string; value: boolean; rawValue: string | undefined; malformed: boolean }>;
  runners: Array<{ key: string; name: string; effectiveEnabled: boolean; disabledReason?: string }>;
}

export function getWorkerGovernanceStatus(): WorkerGovernanceStatus {
  const flags = collectWorkerFlagDiagnostics().map((d) => ({
    key: d.key,
    value: d.resolved,
    rawValue: d.rawValue,
    malformed: d.malformed,
  }));
  const runners = RUNNER_REGISTRY.map((runner) => {
    const decision = evaluateWorkerExecution(runner.key, 'poller', runner);
    return {
      key: runner.key,
      name: runner.name,
      effectiveEnabled: decision.allowed,
      disabledReason: decision.allowed ? undefined : decision.reason,
    };
  });
  return { enforceHumanPolicyApprovals: areHumanPolicyApprovalsEnforced(), flags, runners };
}

export async function triggerJob(jobKey: string): Promise<{ queued: boolean; jobId?: string }> {
  const entry = JOB_REGISTRY.find((j) => j.key === jobKey);
  if (!entry) throw new Error(`Unknown job key: ${jobKey}`);
  if (!entry.triggerSupported) throw new Error(`Manual trigger not supported for job: ${jobKey}`);
  if (!entry.queueName || !entry.jobName) throw new Error(`Missing queue config for job: ${jobKey}`);

  // Manual triggers must produce the same policy decision the scheduler
  // would (WKR-004/WKR-007) — reject here instead of queueing a job the
  // worker-side cron-trigger-queue processor would just throw on anyway.
  const decision = evaluateWorkerExecution(jobKey, 'manual', entry);
  if (!decision.allowed) {
    throw new Error(`Manual trigger not supported for job: ${jobKey} (${decision.reason})`);
  }

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
