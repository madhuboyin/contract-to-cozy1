// apps/frontend/src/hooks/useAdminEnvelopeCoverage.ts
//
// React Query hook for the admin-only Envelope Promotion Coverage dashboard.
// Read-only: there is no mutation counterpart by design.

import { useQuery } from '@tanstack/react-query';
import { fetchAdminEnvelopeCoverage } from '@/lib/api/adminEnvelopeCoverage';

export function useAdminEnvelopeCoverage(options: { includeRetired?: boolean } = {}) {
  return useQuery({
    queryKey: ['admin-envelope-coverage', { includeRetired: !!options.includeRetired }],
    queryFn: () => fetchAdminEnvelopeCoverage({ includeRetired: options.includeRetired, runLimit: 20 }),
    staleTime: 30_000,
  });
}
