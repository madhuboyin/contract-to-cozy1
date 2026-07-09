// apps/backend/src/config/queueDefaults.ts
//
// Shared BullMQ retention policy. Before this, most queues had no
// `defaultJobOptions` at all (completed + failed jobs kept forever, growing
// unbounded in Redis), while a couple of queues (recall-jobs-queue,
// diy-ai-guide-queue) had ad-hoc, asymmetric settings — e.g.
// `removeOnComplete: true` (wiped immediately) paired with
// `removeOnFail: 1000` (kept for a long time). That asymmetry makes a job's
// "Failures" count look artificially worse than its "Success" count on the
// worker-jobs admin dashboard, independent of whether the job is actually
// healthy. Applying the same symmetric, bounded retention to every queue
// keeps those numbers comparable across jobs.
import type { QueueOptions } from 'bullmq';

export const DEFAULT_JOB_RETENTION: NonNullable<QueueOptions['defaultJobOptions']> = {
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 500 },
};
