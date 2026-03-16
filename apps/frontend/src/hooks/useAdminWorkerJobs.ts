// apps/frontend/src/hooks/useAdminWorkerJobs.ts
//
// React Query hooks for the Admin Worker Jobs dashboard.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWorkerJobs, triggerWorkerJob } from '@/lib/api/adminWorkerJobs';

const QUERY_KEY = ['admin-worker-jobs'];
const STALE = 30_000; // 30 seconds — queue stats change frequently

export function useWorkerJobs(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchWorkerJobs,
    staleTime: STALE,
    enabled,
  });
}

export function useTriggerWorkerJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobKey: string) => triggerWorkerJob(jobKey),
    onSuccess: () => {
      // Refresh job list after triggering so queue stats update
      setTimeout(() => qc.invalidateQueries({ queryKey: QUERY_KEY }), 1500);
    },
  });
}
