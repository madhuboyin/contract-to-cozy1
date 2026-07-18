// apps/frontend/src/hooks/useAdminAuditExplorer.ts
import { useQuery } from '@tanstack/react-query';
import { AuditExplorerFilters, queryAdminAuditLog } from '@/lib/api/adminAuditExplorer';

export function useAdminAuditLog(filters: AuditExplorerFilters) {
  return useQuery({
    queryKey: ['admin-audit-log', filters],
    queryFn: () => queryAdminAuditLog(filters),
    staleTime: 10_000,
  });
}
