// apps/workers/src/lib/cronRunHistory.ts
//
// node-cron jobs (scheduleCronJobs() in worker.ts) don't run through BullMQ,
// so the admin worker-jobs dashboard — which only reads BullMQ queue state —
// had no way to show their run history. Every cron-only registry entry
// (the majority of jobs) showed "Never run" regardless of how many times it
// had actually succeeded. This persists a short rolling history to the same
// Redis instance the backend already reads BullMQ state from, keyed by the
// job's registry key, so the dashboard can show real "last run" data for
// non-BullMQ jobs too.

import Redis, { RedisOptions } from 'ioredis';
import { logger } from './logger';

const HISTORY_KEY_PREFIX = 'cron-run-history:';
const MAX_HISTORY_PER_JOB = 5;

export interface CronRunRecord {
  status: 'completed' | 'failed' | 'skipped' | 'partial';
  finishedAt: number; // epoch ms
  durationMs: number;
  failReason?: string;
}

let redisClient: Redis | undefined;

export function initCronRunHistory(connection: RedisOptions): void {
  redisClient = new Redis({ ...connection });
  redisClient.on('error', (err) => {
    logger.error({ err }, '[CRON-RUN-HISTORY] Redis connection error');
  });
}

export async function recordCronRun(jobKey: string, run: CronRunRecord): Promise<void> {
  if (!redisClient) return;
  try {
    const key = `${HISTORY_KEY_PREFIX}${jobKey}`;
    await redisClient.lpush(key, JSON.stringify(run));
    await redisClient.ltrim(key, 0, MAX_HISTORY_PER_JOB - 1);
  } catch (err) {
    logger.error({ err }, `[CRON-RUN-HISTORY] Failed to record run for "${jobKey}"`);
  }
}
