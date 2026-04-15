// Stub: JobQueue.service — worker build only
//
// RiskAssessmentService.calculateAndSaveReport() is the only method called
// by the worker and it does not use JobQueueService or propertyIntelligenceQueue.
// This stub lets the TypeScript compiler resolve the import without pulling in
// the full backend JobQueueService (which itself imports RiskAssessmentService,
// creating a circular dependency).
import type { Queue } from 'bullmq';

export const propertyIntelligenceQueue: Queue = null as unknown as Queue;

const JobQueueService = {
  addJob: async (): Promise<void> => undefined,
};

export default JobQueueService;
