// Stub: JobQueue.service — worker build only
//
// This stub lets the TypeScript compiler resolve the import without pulling in
// the full backend JobQueueService (which itself imports RiskAssessmentService,
// creating a circular dependency). Named queue exports that are actually invoked
// at runtime (e.g. getPermitFetchQueue) use null-casts; callers that enqueue jobs
// should go through the worker's own queue references instead.
//
// W4: the real JobQueue.service.ts now exposes lazy getter functions
// (getPropertyIntelligenceQueue(), getPermitFetchQueue(), etc. — see
// apps/backend/src/lib/queuePort.ts) instead of eager `export const xQueue`
// singletons. Mirrored here as functions returning the same null-cast, for
// exact type/shape parity with the real module.
import type { Queue } from 'bullmq';

const nullQueue: Queue = null as unknown as Queue;

export const getPropertyIntelligenceQueue = (): Queue => nullQueue;
export const getPermitFetchQueue = (): Queue => nullQueue;
export const getDetectUnpermittedWorkQueue = (): Queue => nullQueue;

// Used by diyAiGuide.service.ts to create its own Queue instance at runtime.
export const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT || 6379),
};

const JobQueueService = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addJob: async (..._args: unknown[]): Promise<void> => undefined,
};

export default JobQueueService;
