// apps/workers/src/jobs/recallIngest.job.ts
import { ingestRecallsJob } from './ingestRecalls.job';

export const RECALL_INGEST_JOB = 'recall.ingest';

export async function recallIngestJob() {
  return ingestRecallsJob();
}
