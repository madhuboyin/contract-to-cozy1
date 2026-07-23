// apps/workers/src/jobs/recallMatch.job.ts
import { runRecallMatchingScan } from '../recalls/recallMatching.service';
import { createFollowupsForOpenMatches } from '../recalls/recallFollowups.service';
import { logger, AppLogger } from '../lib/logger';

export const RECALL_MATCH_JOB = 'recall.match';

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern). The two recall
// services are injected as plain function references — each already has
// its own internal defaults/deps, so this job doesn't need to match either
// one's own Deps shape.
export interface RecallMatchJobDeps {
  runRecallMatchingScan: typeof runRecallMatchingScan;
  createFollowupsForOpenMatches: typeof createFollowupsForOpenMatches;
  logger: AppLogger;
}

const defaultDeps: RecallMatchJobDeps = { runRecallMatchingScan, createFollowupsForOpenMatches, logger };

export async function recallMatchJob(deps: RecallMatchJobDeps = defaultDeps) {
  const { runRecallMatchingScan, createFollowupsForOpenMatches, logger } = deps;
  const scan = await runRecallMatchingScan();
  const followups = await createFollowupsForOpenMatches();
  logger.info({ scan, followups }, '[RECALL-MATCH] result');
  return { scan, followups };
}
