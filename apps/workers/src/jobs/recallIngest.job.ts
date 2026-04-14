// apps/workers/src/jobs/recallIngest.job.ts
import { ingestRecallsJob } from './ingestRecalls.job';
import { logger } from '../lib/logger';

export const RECALL_INGEST_JOB = 'recall.ingest';
export async function recallIngestJob() {
  const result = await ingestRecallsJob();
  logger.info('[RECALL-INGEST] result:', result);
  return result;
}

