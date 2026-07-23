// apps/workers/src/lib/cronLease.ts
//
// Multi-replica safety net for scheduleCronJobs() in worker.ts.
//
// Kubernetes runs 2 replicas of the workers deployment, and every replica
// independently registers a node-cron timer for every registry-driven job —
// without a lock, every tick runs each job twice. This gives each jobKey a
// single lease row (CronJobLock) that a replica must CAS-claim before running
// the handler, modeled on the same updateMany-with-guard-clause CAS idiom
// already used for DomainEvent processing in processDomainEvents.job.ts.

import os from 'os';
import { prisma } from './prisma';
import { logger } from './logger';

// Stable per-process identity for observability (which replica holds/held a lease).
const OWNER_ID = `${os.hostname()}:${process.pid}`;

/**
 * Attempt to claim the cron lease for `jobKey` for up to `ttlMs`.
 * Returns true if this process now owns the lease and should run the job;
 * false if another replica currently holds an unexpired lease.
 *
 * Race handling:
 *  1. Try updateMany with a guard clause (CAS): only claim if the row is
 *     unowned (expiresAt IS NULL) or its TTL has already elapsed
 *     (expiresAt < now). This covers both "steady state, TTL passed" and
 *     "row exists but not currently held".
 *  2. If that matches 0 rows, either (a) the row doesn't exist yet (first
 *     tick ever for this jobKey), or (b) another replica currently holds an
 *     unexpired lease. Try `create`; if it succeeds, case (a) — we win. If
 *     it throws Prisma's unique-constraint error P2002, case (b) (or a
 *     concurrent first-run race) — lose gracefully.
 */
export async function acquireCronLease(jobKey: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    const claimed = await prisma.cronJobLock.updateMany({
      where: {
        jobKey,
        OR: [{ expiresAt: null }, { expiresAt: { lt: now } }],
      },
      data: { lockedBy: OWNER_ID, lockedAt: now, expiresAt },
    });
    if (claimed.count === 1) return true;
  } catch (err) {
    logger.error({ err, jobKey }, '[cronLease] updateMany failed while acquiring lease');
    return false;
  }

  try {
    await prisma.cronJobLock.create({
      data: { jobKey, lockedBy: OWNER_ID, lockedAt: now, expiresAt },
    });
    return true;
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // Another replica already holds (or just created/claimed) this lease.
      return false;
    }
    logger.error({ err, jobKey }, '[cronLease] create failed while acquiring lease');
    return false;
  }
}

/**
 * WKR-007: extend jobKey's lease TTL while this process still holds it — a
 * heartbeat so a handler that legitimately runs longer than the original
 * TTL doesn't lose its lease to another replica mid-run. Guarded by
 * lockedBy = OWNER_ID, same as release, so a replica can never renew a
 * lease it doesn't currently hold.
 *
 * Returns false if this replica no longer owns the lease (it already
 * expired and was reclaimed by another replica, or was released) — there
 * is no safe way to abort a handler already in flight, so the caller can
 * only log/alert that a duplicate run may now be happening.
 */
export async function renewCronLease(jobKey: string, ttlMs: number): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ttlMs);
  try {
    const renewed = await prisma.cronJobLock.updateMany({
      where: { jobKey, lockedBy: OWNER_ID },
      data: { expiresAt },
    });
    return renewed.count === 1;
  } catch (err) {
    logger.error({ err, jobKey }, '[cronLease] Failed to renew lease');
    return false;
  }
}

/**
 * Release the lease immediately after the handler finishes (success or
 * failure), so the *next* scheduled tick doesn't have to wait out the TTL.
 * This matters for jobs with short intervals (e.g. severe-weather-alerts
 * runs every 15 minutes) — TTL is a crash-recovery safety net only, not the
 * normal release mechanism.
 * Guarded by lockedBy = OWNER_ID so a replica can never release a lease it
 * doesn't currently hold (e.g. if its own lease already expired and was
 * reclaimed by another replica mid-run).
 */
export async function releaseCronLease(jobKey: string): Promise<void> {
  try {
    await prisma.cronJobLock.updateMany({
      where: { jobKey, lockedBy: OWNER_ID },
      data: { expiresAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, jobKey }, '[cronLease] Failed to release lease');
  }
}
