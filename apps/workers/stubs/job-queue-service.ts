// Stub: JobQueue.service — worker build only
//
// This stub lets the TypeScript compiler resolve the import without pulling in
// the full backend JobQueueService (which itself imports RiskAssessmentService,
// creating a circular dependency). Named queue exports that are actually invoked
// at runtime (e.g. permitFetchQueue) use null-casts; callers that enqueue jobs
// should go through the worker's own queue references instead.
import type { Queue } from 'bullmq';

export const propertyIntelligenceQueue: Queue = null as unknown as Queue;
export const permitFetchQueue: Queue = null as unknown as Queue;
export const detectUnpermittedWorkQueue: Queue = null as unknown as Queue;

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
