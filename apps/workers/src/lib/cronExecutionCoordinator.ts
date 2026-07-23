// apps/workers/src/lib/cronExecutionCoordinator.ts
//
// WKR-007: scheduled cron ticks and manual/admin "Run Job" triggers
// previously used different concurrency controls. Only the scheduled path
// (scheduleCronJobs() in worker.ts) acquired the DB-backed cron lease
// (./cronLease.ts) — the manual path (cronTriggerWorker, also in worker.ts)
// relied solely on BullMQ's `concurrency: 1` on the cron-trigger-queue
// consumer, which only prevents two *manual* triggers from overlapping each
// other. A manual trigger could still run concurrently with an in-flight
// *scheduled* run of the same job. The lease was also acquired once and
// never renewed, so a job that legitimately ran past its TTL could have its
// lease reclaimed by a second replica mid-run, letting both replicas be
// "running" the same job at once.
//
// This module is the single place both entry paths acquire/renew/release
// the lease, so there is exactly one concurrency mechanism — not two that
// can silently diverge — and it is used identically by both call sites.

import { acquireCronLease, releaseCronLease, renewCronLease } from './cronLease';
import { normalizeJobEnvKey } from '@worker-shared/config/workerExecutionPolicy';
import { logger } from './logger';

// Crash-recovery safety net only — the lease is normally released explicitly
// right after the handler finishes. Default is well under the tightest
// registry interval (severe-weather-alerts, every 15 min).
const DEFAULT_LEASE_TTL_MS = Number(process.env.CRON_LEASE_TTL_MS) || 10 * 60 * 1000;

// Renew well before the TTL elapses so a normal scheduler tick delay (Redis
// latency, event-loop pressure) can never cost a still-running job its
// lease — renewing at the literal TTL boundary would be a race.
const LEASE_RENEWAL_FRACTION = 0.4;
const MIN_RENEWAL_INTERVAL_MS = 1000;

/**
 * Per-job lease-TTL override: WORKER_JOB_<NORMALIZED_KEY>_LEASE_TTL_MS,
 * mirroring the WORKER_JOB_<KEY>_ENABLED override pattern in
 * workerExecutionPolicy.ts (same normalizeJobEnvKey). Falls back to the
 * global default for any job that hasn't needed a longer budget yet — most
 * registry jobs finish in seconds; a handful (gazette generation, full
 * property sweeps) may need to opt into a longer one as that's observed in
 * practice, without a code change.
 */
function resolveLeaseTtlMs(jobKey: string): number {
  const envKey = normalizeJobEnvKey(jobKey).replace(/_ENABLED$/, '_LEASE_TTL_MS');
  const raw = process.env[envKey];
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LEASE_TTL_MS;
}

export type CronLeaseOutcome<T> =
  | { status: 'skipped'; reason: string }
  | { status: 'ran'; result: T; durationMs: number };

/**
 * Acquire jobKey's lease, run `fn` while renewing the lease on an interval,
 * and release it once `fn` settles. `fn`'s rejection is not caught here —
 * it propagates to the caller after the lease is released, so scheduled and
 * manual callers can each apply their own failure handling (record history
 * vs. reject the BullMQ job) without this module deciding that for them.
 *
 * Overlap policy: SKIP_IF_RUNNING, and it is the only one implemented. A
 * `{ status: 'skipped' }` result (no lease acquired, `fn` never called)
 * means another replica currently holds jobKey's lease — deliberately the
 * same outcome whether the holder is a scheduled tick or another manual
 * trigger, since every registry job today is a full-sweep or singleton-type
 * job for which overlapping is unsafe. QUEUE_AFTER_RUNNING or a real
 * safe-concurrency policy would need a per-job declaration this registry
 * doesn't have yet; nothing currently needs it.
 */
export async function runWithCronLease<T>(jobKey: string, fn: () => Promise<T>): Promise<CronLeaseOutcome<T>> {
  const leaseTtlMs = resolveLeaseTtlMs(jobKey);
  const gotLease = await acquireCronLease(jobKey, leaseTtlMs);
  if (!gotLease) {
    return { status: 'skipped', reason: 'lease held by another replica or in-flight run' };
  }

  const renewalIntervalMs = Math.max(MIN_RENEWAL_INTERVAL_MS, Math.floor(leaseTtlMs * LEASE_RENEWAL_FRACTION));
  const heartbeat = setInterval(() => {
    void renewCronLease(jobKey, leaseTtlMs).then((renewed) => {
      if (!renewed) {
        logger.warn(
          `[cronExecutionCoordinator] Failed to renew lease for "${jobKey}" — ` +
          `another replica may now also be running it`,
        );
      }
    });
  }, renewalIntervalMs);
  heartbeat.unref();

  const startedAt = Date.now();
  try {
    const result = await fn();
    return { status: 'ran', result, durationMs: Date.now() - startedAt };
  } finally {
    clearInterval(heartbeat);
    await releaseCronLease(jobKey);
  }
}
