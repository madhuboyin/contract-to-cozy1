// apps/frontend/src/hooks/useAdminWorkQueues.ts
//
// React Query hook for the Admin operational work-queues overview.

import { useQuery } from '@tanstack/react-query';
import { fetchAdminWorkQueues } from '@/lib/api/adminWorkQueues';

export function useAdminWorkQueues() {
  return useQuery({
    queryKey: ['admin-work-queues'],
    queryFn: fetchAdminWorkQueues,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
