// apps/workers/src/jobs/matchRecalls.job.ts
import { runRecallMatchingScan } from '../recalls/recallMatching.service';
import { createFollowupsForOpenMatches } from '../recalls/recallFollowups.service';

export async function matchRecallsJob() {
  const scan = await runRecallMatchingScan();
  const followups = await createFollowupsForOpenMatches();

  return { scan, followups };
}
