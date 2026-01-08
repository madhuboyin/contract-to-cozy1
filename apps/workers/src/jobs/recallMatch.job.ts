// apps/workers/src/jobs/recallMatch.job.ts
import { runRecallMatchingScan } from '../recalls/recallMatching.service';
import { createFollowupsForOpenMatches } from '../recalls/recallFollowups.service';

export const RECALL_MATCH_JOB = 'recall.match';
export async function recallMatchJob() {
  const scan = await runRecallMatchingScan();
  const followups = await createFollowupsForOpenMatches();
  console.log('[RECALL-MATCH] scan:', scan, 'followups:', followups);
  return { scan, followups };
}
