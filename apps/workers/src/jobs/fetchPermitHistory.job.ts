import { permitFetchService } from '../../../backend/src/services/permitFetch.service';

export const FETCH_PERMIT_HISTORY_JOB = 'fetch-permit-history';

export async function fetchPermitHistoryJob(fetchJobId: string): Promise<void> {
  await permitFetchService.runFetch(fetchJobId);
}
