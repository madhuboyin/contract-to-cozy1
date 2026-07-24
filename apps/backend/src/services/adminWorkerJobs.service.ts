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
import { isPropertyAllowlisted, isSmokeAllowlistConfigured } from '../config/smokeTestConfig';
import { isSmokeCorrelationId } from '../lib/smokeTestCorrelation';
import { prisma } from '../lib/prisma';
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
  status: 'completed' | 'failed' | 'skipped' | 'partial';
  finishedAt: number | null;
  durationMs: number | null;
  failReason?: string;
  /** Whether this run was requested with { dryRun: true } (W6 smoke checklist). */
  dryRun?: boolean;
  /** The handler's returned outcome (WorkerRunResult or a job-specific shape), when available. */
  result?: unknown;
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
  /** Whether a manual trigger can pass { dryRun: true } and have the job honor it (W4 item 8). */
  supportsDryRun: boolean;
  /** Whether a scoped smoke run can pass { propertyId } (W6 item 2/5) — see workerJobRegistry's supportsPropertyScope. */
  supportsPropertyScope: boolean;
  /** Both SMOKE_TEST_PROPERTY_ALLOWLIST and SMOKE_TEST_RECIPIENT_EMAIL_ALLOWLIST have at least one entry (W6 smoke-checklist prerequisite). */
  smokeAllowlistConfigured: boolean;
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
  status: 'completed' | 'failed' | 'skipped' | 'partial';
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

// WKR-007 (partial): dedup window for triggerJob()'s deterministic jobId —
// see the comment at its call site. Short enough that a legitimate two
// manual re-triggers of the same job a minute apart both go through.
const MANUAL_TRIGGER_DEDUP_WINDOW_MS = 15_000;

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
      dryRun: job.data?.dryRun === true,
      result: job.returnvalue,
    })),
    ...filterByName(failed).map((job) => ({
      id: job.id ?? '',
      jobName: job.name,
      status: 'failed' as const,
      finishedAt: job.finishedOn ?? null,
      durationMs:
        job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
      failReason: job.failedReason ?? undefined,
      dryRun: job.data?.dryRun === true,
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
  // Same value for every job — computed once per call, not per job, but kept
  // on each WorkerJobDetail so the frontend doesn't need a second fetch.
  const smokeAllowlistConfigured = isSmokeAllowlistConfigured();
  return Promise.all(
    JOB_REGISTRY.map(async (job) => {
      const state = effectiveExecutionState(job);
      if (!job.queueName) {
        const recentRuns = await getCronRunHistory(job.key);
        return { ...job, ...state, recentRuns, smokeAllowlistConfigured };
      }
      try {
        const [queueStats, recentRuns] = await Promise.all([
          getQueueStats(job.queueName, job.jobName),
          getRecentRuns(job.queueName, job.jobName),
        ]);
        return { ...job, ...state, queueStats, recentRuns, smokeAllowlistConfigured };
      } catch {
        return { ...job, ...state, recentRuns: [], smokeAllowlistConfigured };
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

export async function triggerJob(
  jobKey: string,
  options?: { dryRun?: boolean; propertyId?: string },
): Promise<{ queued: boolean; jobId?: string }> {
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

  const dryRun = options?.dryRun === true;
  // W4 item 8: dry-run is a per-job contract, not a universal capability —
  // a job that never declared supportsDryRun has no code path honoring the
  // flag, so a caller requesting one must get a clear rejection rather than
  // silently running the job for real.
  if (dryRun && !entry.supportsDryRun) {
    throw new Error(`Dry-run not supported for job: ${jobKey}`);
  }

  const propertyId = options?.propertyId?.trim() || undefined;
  // W6 item 2/5: a scoped smoke run must both (a) target a job that
  // actually supports property scoping and (b) target a property the
  // operator has explicitly allowlisted — reject here with a clear error
  // rather than queueing a job that would fail deep inside the worker.
  if (propertyId) {
    if (!entry.supportsPropertyScope) {
      throw new Error(`Property scope not supported for job: ${jobKey}`);
    }
    if (!isPropertyAllowlisted(propertyId)) {
      throw new Error(`propertyId ${propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`);
    }
  }

  const q = getQueue(entry.queueName);
  // A stable jobId within a short window de-duplicates a double-click/
  // double-submit of the admin "Run Job" button — BullMQ treats `add()` with
  // an already-present, not-yet-removed jobId as a no-op that returns the
  // existing job rather than queueing a second one. The window is bucketed
  // (not fully static) so a deliberate later re-trigger of the same job with
  // the same params isn't permanently blocked once a prior run has left a
  // completed job occupying that id (DEFAULT_JOB_RETENTION keeps up to 500
  // completed jobs, so a static id could stay "taken" indefinitely).
  const dedupBucket = Math.floor(Date.now() / MANUAL_TRIGGER_DEDUP_WINDOW_MS);
  // BullMQ rejects ":" in custom job IDs ("Custom Id cannot contain :") — see the
  // same note in workers/src/runners/highPriorityEmailEnqueue.poller.ts.
  const jobId = `manual-${jobKey}-${dryRun}-${propertyId ?? 'none'}-${dedupBucket}`;
  const job = await q.add(
    entry.jobName,
    { dryRun, propertyId },
    {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  );
  return { queued: true, jobId: job.id };
}

// ─── W6 item 3: smoke-run cleanup (exact IDs only, never a date/status sweep) ─

export interface SmokeCleanupPreview {
  correlationId: string;
  notificationIds: string[];
  mortgageRateSnapshotIds: string[];
}

async function resolveSmokeRecordIds(correlationId: string): Promise<SmokeCleanupPreview> {
  if (!isSmokeCorrelationId(correlationId)) {
    throw new Error(`Not a smoke correlation ID: ${correlationId}`);
  }
  const [notifications, snapshots] = await Promise.all([
    prisma.notification.findMany({
      where: { metadata: { path: ['smokeCorrelationId'], equals: correlationId } },
      select: { id: true },
    }),
    prisma.mortgageRateSnapshot.findMany({
      where: { metadataJson: { path: ['smokeCorrelationId'], equals: correlationId } },
      select: { id: true },
    }),
  ]);
  return {
    correlationId,
    notificationIds: notifications.map((n) => n.id),
    mortgageRateSnapshotIds: snapshots.map((s) => s.id),
  };
}

/** Preview exactly which records a smoke run created, by correlation ID — no writes. */
export async function previewSmokeCleanup(correlationId: string): Promise<SmokeCleanupPreview> {
  return resolveSmokeRecordIds(correlationId);
}

/** Delete exactly the records tagged with this correlation ID — never a date/status range. */
export async function deleteSmokeRecords(correlationId: string): Promise<SmokeCleanupPreview> {
  const preview = await resolveSmokeRecordIds(correlationId);
  await Promise.all([
    preview.notificationIds.length
      ? prisma.notification.deleteMany({ where: { id: { in: preview.notificationIds } } })
      : Promise.resolve(),
    preview.mortgageRateSnapshotIds.length
      ? prisma.mortgageRateSnapshot.deleteMany({ where: { id: { in: preview.mortgageRateSnapshotIds } } })
      : Promise.resolve(),
  ]);
  logger.info(
    { correlationId, notificationCount: preview.notificationIds.length, snapshotCount: preview.mortgageRateSnapshotIds.length },
    '[ADMIN-WORKER-JOBS] Smoke-test records deleted by exact correlation ID',
  );
  return preview;
}
